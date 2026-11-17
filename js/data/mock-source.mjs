/**
 * Mock data source.
 *
 * Reads the JSON files in data/mock and data/reference, then answers each
 * reporting item's view with the same shape the real API should return.
 * Edit any of these files and refresh the page to see the change:
 *
 *   data/mock/daily-metrics.json   one row per day per platform (the main numbers)
 *   data/mock/reference.json       shares, conversion rates, incidents, lookup values
 *   data/mock/lga-activity.json    how likely residents of each council area are to use the app
 *   data/mock/usage-by-hour.json   when in the week people use the app
 *   data/mock/targets.json         targets and status thresholds for headline measures
 *   data/mock/events.json          campaigns and incidents noted on charts
 *   data/mock/value.json           channel costs and assumptions for the value estimate
 *   data/mock/retention.json       weekly sign-up cohorts and how many came back
 *   data/mock/services-detail.json renewal pipeline, time to complete, payment amounts
 *   data/mock/operations.json      app version adoption, notification settings, backend response times
 *   data/mock/azure-cost.json     Azure cost: one row per day per service meter (Cost Management export shape)
 *   data/mock/cost-settings.json  monthly budget, forecast run-rate days and daily cost thresholds
 *   data/reference/lga.json        council names, populations and map tile positions
 */
import { fetchJson } from './fetch-json.mjs';

const FIELDS = [
  'activeUsers', 'newAccounts', 'credentialsAdded', 'credentialChecks',
  'credentialChecksFailed', 'transactionsFinished', 'transactionsCompleted', 'notificationsSent'
];

const sum = a => a.reduce((x, y) => x + y, 0);
const avg = a => (a.length ? sum(a) / a.length : 0);
const ratio = (a, b) => (b ? a / b : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export async function createMockSource({ mockBasePath, referenceBasePath, features = {} }) {
  const [daily, ref, hourly, lgaActivity, lgaRef, targetsFile, eventsFile, value, retention, svc, ops, costFile, costCfg] = await Promise.all([
    fetchJson(mockBasePath + 'daily-metrics.json'),
    fetchJson(mockBasePath + 'reference.json'),
    fetchJson(mockBasePath + 'usage-by-hour.json'),
    fetchJson(mockBasePath + 'lga-activity.json'),
    fetchJson(referenceBasePath + 'lga.json'),
    fetchJson(mockBasePath + 'targets.json'),
    fetchJson(mockBasePath + 'events.json'),
    fetchJson(mockBasePath + 'value.json'),
    fetchJson(mockBasePath + 'retention.json'),
    fetchJson(mockBasePath + 'services-detail.json'),
    fetchJson(mockBasePath + 'operations.json'),
    fetchJson(mockBasePath + 'azure-cost.json'),
    fetchJson(mockBasePath + 'cost-settings.json')
  ]);

  /* ---- index the daily rows: field -> platform -> value per date ---- */
  const rows = daily.rows || [];
  const dates = [...new Set(rows.map(r => r.date))].sort();
  if (!dates.length) throw new Error('data/mock/daily-metrics.json has no rows');
  const pos = new Map(dates.map((d, i) => [d, i]));
  const table = {};
  FIELDS.forEach(f => { table[f] = { ios: new Array(dates.length).fill(0), android: new Array(dates.length).fill(0) }; });
  rows.forEach(r => {
    const i = pos.get(r.date), p = r.platform === 'ios' ? 'ios' : 'android';
    FIELDS.forEach(f => { table[f][p][i] += Number(r[f]) || 0; });
  });

  const series = (field, platform) =>
    platform === 'all' ? table[field].ios.map((v, i) => v + table[field].android[i]) : table[field][platform];

  // last `range` values, or the `range` values before that when back = 1
  const win = (arr, range, back = 0) => {
    const end = arr.length - back * range;
    return end <= 0 ? [] : arr.slice(Math.max(0, end - range), end);
  };
  const total = (field, p, back = 0) => sum(win(series(field, p.platform), p.range, back));

  const uniqueFactor = range => Number(ref.uniqueUsersFactor[String(range)]) || 4;
  const activeUsers = (range, platform, back = 0) =>
    avg(win(series('activeUsers', platform), range, back)) * uniqueFactor(range);
  const platformShare = (range, platform) => {
    if (platform === 'all') return 1;
    const ios = ratio(sum(win(series('activeUsers', 'ios'), range)), sum(win(series('activeUsers', 'all'), range)));
    return platform === 'ios' ? ios : 1 - ios;
  };
  // Service types whose feature is switched off (CONFIG.features) are dropped, and the
  // remaining shares are rescaled so the services still account for every transaction.
  const TYPE_FEATURE = { fuel: 'fuelExemption' };
  {
    const on = ref.transactionTypes.filter(t => features[TYPE_FEATURE[t.key]] !== false);
    const total = on.reduce((a, t) => a + t.share, 0) || 1;
    if (on.length !== ref.transactionTypes.length) ref.transactionTypes = on.map(t => ({ ...t, share: t.share / total }));
  }
  const txType = key => ref.transactionTypes.find(t => t.key === key) || ref.transactionTypes[0];

  // apply step-by-step conversion rates, with optional per-platform overrides
  const cascade = (start, steps, platform) => {
    let v = start;
    return steps.map(s => {
      const rate = platform === 'android' && s.rateAndroid != null ? s.rateAndroid
                 : platform === 'ios' && s.rateIos != null ? s.rateIos : s.rate;
      v *= rate;
      return { label: s.label, source: s.source, value: v };
    });
  };
  const periodTotals = field => p => ({
    current: total(field, p),
    previous: total(field, p, 1),
    daily: win(series(field, p.platform), p.range)
  });

  // first and last date of the current window (back = 0) or the one before it (back = 1)
  const bounds = (range, back = 0) => { const w = win(dates, range, back); return { from: w[0], to: w[w.length - 1] }; };
  const overlaps = (e, b) => b.from && e.from <= b.to && e.to >= b.from;

  // finished, completed and failed transactions per service
  const byType = (p, back = 0) => {
    const finished = total('transactionsFinished', p, back);
    const base = ratio(total('transactionsCompleted', p, back), finished);
    return ref.transactionTypes.map(t => {
      const n = finished * t.share, r = clamp(base + t.successAdjust, 0, 1);
      return { key: t.key, label: t.label, finished: n, completed: n * r, failed: n * (1 - r) };
    });
  };

  // value estimate: what the same transactions would have cost in other channels
  const channelShift = (p, back = 0) => {
    const cost = value.costPerTransaction, types = byType(p, back);
    const rows = (value.services || []).map(sv => {
      const t = types.find(x => x.key === sv.key);
      if (!t) return null;
      const o = sv.otherwise, other = sv.otherChannelsPer30Days * p.range / 30;
      const perTxn = o.counter * cost.counter + o.phone * cost.phone + o.website * cost.website - cost.app;
      return {
        key: t.key, label: t.label, appCompleted: t.completed, otherChannels: other,
        appShare: ratio(t.completed, t.completed + other),
        counterAvoided: t.completed * o.counter * attribution, phoneAvoided: t.completed * o.phone * attribution,
        costAvoided: t.completed * perTxn * attribution
      };
    }).filter(Boolean);
    const tot = k => sum(rows.map(r => r[k]));
    return { rows, totals: {
      appCompleted: tot('appCompleted'), counterAvoided: tot('counterAvoided'), phoneAvoided: tot('phoneAvoided'),
      costAvoided: tot('costAvoided'), appShare: ratio(tot('appCompleted'), tot('appCompleted') + tot('otherChannels'))
    } };
  };

  const lgaRows = p => views.vw_UsageByLga(p).map(r => ({ ...r, ...lgaRef.lgas.find(l => l.code === r.code) }));
  const rateOf = list => ratio(sum(list.map(r => r.users)), sum(list.map(r => r.population))) * 1000;

  /* ---- Azure cost: AUD per day, in total and per service, lined up with `dates` ---- */
  const col = name => (costFile.columns || []).indexOf(name);
  const cDate = col('UsageDate'), cService = col('ServiceName'), cCost = col('Cost');
  const costTotal = new Array(dates.length).fill(0), costBy = {}, costByMonth = {};
  (costFile.rows || []).forEach(r => {
    const d = r[cDate], v = Number(r[cCost]) || 0, i = pos.get(d);
    costByMonth[d.slice(0, 7)] = (costByMonth[d.slice(0, 7)] || 0) + v;
    if (i == null) return;
    costTotal[i] += v;
    (costBy[r[cService]] ||= new Array(dates.length).fill(0))[i] += v;
  });
  // Cost is not split by phone type, so unit costs always use all platforms
  const unitCost = field => p => {
    const c = costTotal, m = series(field, 'all');
    const wc = win(c, p.range), wm = win(m, p.range);
    return {
      current: ratio(sum(wc), sum(wm)),
      previous: ratio(sum(win(c, p.range, 1)), sum(win(m, p.range, 1))),
      daily: wc.map((v, i) => ratio(v, wm[i]))
    };
  };
  const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const budgetFor = month => Number((costCfg.budgetByMonth || {})[month] ?? costCfg.monthlyBudget) || 0;

  /* ---- value: estimated cost avoided per day, all platforms ---- */
  const prog = value.programmeCosts || {};
  const attribution = Number.isFinite(value.attribution) ? value.attribution : 1;
  const otherPerDay = (prog.otherRunningPerMonth || 0) * 12 / 365;
  // average saving for one completed app transaction, weighted by each service's share of transactions
  const savingPerTxn = (() => {
    const c = value.costPerTransaction || {};
    return sum((value.services || []).map(sv => {
      const t = ref.transactionTypes.find(x => x.key === sv.key);
      if (!t) return 0;
      const o = sv.otherwise;
      return t.share * (o.counter * c.counter + o.phone * c.phone + o.website * c.website - c.app);
    }));
  })();
  const valueDaily = series('transactionsCompleted', 'all').map(v => v * savingPerTxn);

  /* ---- views: one per reporting item, named like the SQL view in Fabric ---- */
  const views = {
    vw_ActiveUsers: p => ({
      current: activeUsers(p.range, p.platform),
      previous: activeUsers(p.range, p.platform, 1),
      daily: win(series('activeUsers', p.platform), p.range)
    }),
    vw_NewAccounts: periodTotals('newAccounts'),
    vw_CredentialChecks: periodTotals('credentialChecks'),

    vw_TransactionSuccess: p => {
      const f = series('transactionsFinished', p.platform), c = series('transactionsCompleted', p.platform);
      const wf = win(f, p.range), wc = win(c, p.range);
      return {
        current: ratio(sum(wc), sum(wf)),
        previous: ratio(sum(win(c, p.range, 1)), sum(win(f, p.range, 1))),
        daily: wc.map((v, i) => ratio(v, wf[i]))
      };
    },

    vw_DailyActiveUsersByPlatform: p => {
      const out = { dates: win(dates, p.range) };
      if (p.platform !== 'android') out.ios = win(series('activeUsers', 'ios'), p.range);
      if (p.platform !== 'ios') out.android = win(series('activeUsers', 'android'), p.range);
      return out;
    },

    vw_NewAccountsByWeek: p => {
      const d = win(series('newAccounts', p.platform), p.range), ds = win(dates, p.range);
      if (p.range <= 7) return { daily: true, labels: ds, values: d };
      const labels = [], values = [];
      for (let e = d.length; e >= 7; e -= 7) {          // full weeks only, counting back from the latest day
        values.unshift(sum(d.slice(e - 7, e)));
        labels.unshift(ds[e - 7]);
      }
      return { daily: false, labels, values };
    },

    vw_OnboardingFunnel: p => cascade(total('newAccounts', p), ref.onboardingFunnel, p.platform),

    vw_TransactionFunnel: p => {
      const t = txType(p.txType);
      return cascade(total('transactionsFinished', p) * t.share * ref.startedPerFinished, t.steps, p.platform);
    },

    vw_ReminderFunnel: p =>
      cascade(total('notificationsSent', p) * ref.reminderFunnel.shareOfNotifications, ref.reminderFunnel.steps, p.platform),

    vw_FuelExemptionFunnel: p => {
      const t = txType('fuel');
      return cascade(total('transactionsFinished', p) * t.share * ref.fuelExemption.startedPerFinished, t.steps, p.platform);
    },

    vw_CredentialsByType: p => {
      const share = platformShare(p.range, p.platform), added = total('credentialsAdded', p);
      return ref.credentialTypes.map(c => ({ label: c.label, active: c.active * share, added: added * c.shareOfAdded }));
    },

    vw_TransactionsByType: p => byType(p),

    vw_CredentialChecksDaily: p => ({
      dates: win(dates, p.range),
      checks: win(series('credentialChecks', p.platform), p.range),
      failed: win(series('credentialChecksFailed', p.platform), p.range)
    }),

    vw_CheckMethods: p => {
      const t = total('credentialChecks', p);
      return ref.checkMethods.map(m => ({ label: m.label, checks: t * m.share, share: m.share }));
    },

    vw_FailureReasons: p => {
      const failed = total('transactionsFinished', p) - total('transactionsCompleted', p);
      return ref.failureReasons.map(r => ({ reason: r.reason, code: r.code, failures: failed * r.share, share: r.share }));
    },

    vw_FuelExemptionByCategory: p => {
      const t = txType('fuel');
      const steps = cascade(total('transactionsFinished', p) * t.share * ref.fuelExemption.startedPerFinished, t.steps, p.platform);
      const submitted = (steps.find(s => s.label === ref.fuelExemption.submittedStep) || { value: 0 }).value;
      const split = ref.fuelExemption.applicantSplit;
      return ref.fuelExemption.categories.map(c => ({
        label: c.label,
        individuals: submitted * split.individuals * c.individualShare,
        businesses: submitted * split.businesses * c.businessShare
      }));
    },

    vw_ProviderAvailability: () => {
      const last = dates.slice(-30);
      return ref.providers.map(pr => {
        let minutes = 0;
        const days = last.map(d => {
          const status = (pr.incidents && pr.incidents[d]) || 'up';
          minutes += ref.downtimeMinutes[status] || 0;
          return { date: d, status };
        });
        return { name: pr.name, description: pr.description, days, uptime: 1 - minutes / (last.length * 1440) };
      });
    },

    vw_FailedTransactionsDaily: p => {
      const f = win(series('transactionsFinished', p.platform), p.range);
      const c = win(series('transactionsCompleted', p.platform), p.range);
      return { dates: win(dates, p.range), failed: f.map((v, i) => v - c[i]) };
    },

    vw_AppVersions: p => {
      const devices = activeUsers(p.range, p.platform) * ref.devicesPerActiveUser;
      return ref.appVersions.map(v => ({ version: v.version, devices: devices * v.share, share: v.share }));
    },

    vw_NotificationPerformance: p => {
      const sent = total('notificationsSent', p);
      return ref.notificationTypes.map(n => ({
        type: n.type, sent: sent * n.share, delivered: n.delivered, opened: n.opened, acted: n.acted
      }));
    },

    // Active users per council area. Like the SQL view's HAVING clause,
    // areas below the privacy threshold are left out of the result.
    vw_UsageByLga: p => {
      const threshold = p.threshold ?? 10;
      const activity = new Map((lgaActivity.lgas || []).map(a => [a.code, a]));
      const platforms = p.platform === 'all' ? ['ios', 'android'] : [p.platform];
      const users = new Map(lgaRef.lgas.map(l => [l.code, 0]));
      platforms.forEach(pl => {
        const totalUsers = activeUsers(p.range, pl);
        const weights = lgaRef.lgas.map(l => {
          const a = activity.get(l.code) || { adoptionWeight: 0.5, iosShare: 0.6 };
          return l.population * a.adoptionWeight * (pl === 'ios' ? a.iosShare : 1 - a.iosShare);
        });
        const W = sum(weights) || 1;
        lgaRef.lgas.forEach((l, i) => users.set(l.code, users.get(l.code) + totalUsers * weights[i] / W));
      });
      return lgaRef.lgas
        .map(l => ({ code: l.code, users: Math.round(users.get(l.code)), per1000: users.get(l.code) / l.population * 1000 }))
        .filter(r => r.users >= threshold);
    },

    // Average sessions in each hour of a typical week (Adelaide time)
    vw_UsageByHour: p => {
      const m = hourly.matrix, W = sum(m.flat()) || 1;
      const sessions = total('activeUsers', p) * ref.sessionsPerActiveUserPerDay;
      const weeks = Math.max(1, p.range / 7);
      return { days: hourly.days, matrix: m.map(row => row.map(w => sessions * w / W / weeks)) };
    }
  };

  /* ---- views added for the leadership items ---- */
  Object.assign(views, {
    // Targets and thresholds (a small reference table in Fabric)
    vw_Targets: () => targetsFile.targets || [],

    // Campaigns and incidents that overlap this period or the one before it
    vw_Events: p => {
      const cur = bounds(p.range), prev = bounds(p.range, 1);
      return (eventsFile.events || [])
        .map(e => ({ ...e, inPeriod: overlaps(e, cur) ? 'current' : overlaps(e, prev) ? 'previous' : null }))
        .filter(e => e.inPeriod);
    },

    // Success rate per day, with the same days of the previous period for comparison
    vw_TransactionSuccessDaily: p => {
      const f = series('transactionsFinished', p.platform), c = series('transactionsCompleted', p.platform);
      const wf = win(f, p.range), wc = win(c, p.range), pf = win(f, p.range, 1), pc = win(c, p.range, 1);
      return {
        dates: win(dates, p.range),
        rate: wc.map((v, i) => ratio(v, wf[i])),
        finished: wf,
        failed: wf.map((v, i) => v - wc[i]),
        previousRate: pc.length === wc.length ? pc.map((v, i) => ratio(v, pf[i])) : []
      };
    },

    // Value estimate: app share of each service and the cost avoided
    vw_ChannelShift: p => {
      const cur = channelShift(p), prev = total('transactionsFinished', p, 1) ? channelShift(p, 1) : null;
      return {
        currency: value.currency || 'AUD',
        costPerTransaction: value.costPerTransaction,
        minutesSavedPerCounterVisit: value.minutesSavedPerCounterVisit,
        rows: cur.rows,
        totals: { ...cur.totals, previousCostAvoided: prev ? prev.totals.costAvoided : null, previousAppShare: prev ? prev.totals.appShare : null }
      };
    },

    /* ---- value: money views built on the channel-shift estimate and the Azure cost data ---- */

    // Period totals: estimated cost avoided against what the app costs to run (Azure plus other running costs)
    vw_NetBenefit: p => {
      const q = { ...p, platform: 'all' };
      const side = back => {
        const avoided = win(valueDaily, p.range, back), azure = win(costTotal, p.range, back);
        if (!avoided.length) return null;
        // same cost-avoided figure as ITM-26, so the two cards always agree
        const a = channelShift(q, back).totals.costAvoided, az = sum(azure), other = otherPerDay * avoided.length;
        return { avoided: a, azure: az, other, cost: az + other, net: a - az - other, ratio: ratio(a, az + other) };
      };
      const months = [...new Set(win(dates, p.range).map(d => d.slice(0, 7)))].map(m => {
        const idx = dates.map((d, i) => (d.startsWith(m) ? i : -1)).filter(i => i >= 0);
        const a = sum(idx.map(i => valueDaily[i])) * attribution, az = sum(idx.map(i => costTotal[i])), other = otherPerDay * idx.length;
        return { month: m, days: idx.length, full: idx.length === daysIn(m), avoided: a, azure: az, other, net: a - az - other };
      });
      return { current: side(0), previous: side(1), months, attribution, otherRunningPerMonth: prog.otherRunningPerMonth || 0, range: q.range };
    },

    // Running totals since the first day of data: cost avoided against build and running costs
    vw_ValueCumulative: () => {
      let a = 0, c = prog.oneOffBuild || 0, breakEven = null;
      const avoided = [], cost = [];
      dates.forEach((d, i) => {
        a += valueDaily[i] * attribution; c += costTotal[i] + otherPerDay;
        avoided.push(a); cost.push(c);
        if (!breakEven && a >= c) breakEven = d;
      });
      return { dates, avoided, cost, net: a - c, oneOffBuild: prog.oneOffBuild || 0, buildDate: prog.buildDate || null, breakEven };
    },

    // What one completed transaction costs in each channel; the app both as assumed and as measured from Azure
    vw_ChannelUnitCosts: p => {
      const done = sum(win(series('transactionsCompleted', 'all'), p.range));
      const azure = sum(win(costTotal, p.range)), days = win(dates, p.range).length;
      const c = value.costPerTransaction || {};
      return {
        channels: [
          { key: 'counter', label: 'Service centre counter', cost: c.counter, basis: 'assumed' },
          { key: 'phone', label: 'Phone', cost: c.phone, basis: 'assumed' },
          { key: 'website', label: 'Website', cost: c.website, basis: 'assumed' },
          { key: 'app', label: 'App, as assumed in the estimate', cost: c.app, basis: 'assumed' },
          { key: 'appAllIn', label: 'App, measured: Azure plus running costs', cost: ratio(azure + otherPerDay * days, done), basis: 'measured' },
          { key: 'appAzure', label: 'App, measured: Azure only', cost: ratio(azure, done), basis: 'measured' }
        ],
        completed: done
      };
    },

    // Inputs for the what-if calculator: completed app transactions per service and the assumptions
    vw_ValueInputs: p => {
      const types = byType({ ...p, platform: 'all' });
      return {
        costPerTransaction: value.costPerTransaction, attribution,
        services: (value.services || []).map(sv => {
          const t = types.find(x => x.key === sv.key);
          return t ? { key: sv.key, label: t.label, completed: t.completed, otherwise: sv.otherwise } : null;
        }).filter(Boolean)
      };
    },

    // One council compared with its group and the state. With no lga, the state picture.
    vw_LgaProfile: p => {
      const rows = lgaRows(p);
      const state = {
        stateRate: rateOf(rows),
        metroRate: rateOf(rows.filter(r => r.group === 'metro')),
        regionalRate: rateOf(rows.filter(r => r.group !== 'metro')),
        stateUsers: sum(rows.map(r => r.users)), councils: lgaRef.lgas.length, hidden: lgaRef.lgas.length - rows.length
      };
      if (!p.lga) return { code: null, ...state };
      const r = rows.find(x => x.code === p.lga);
      if (!r) return { code: p.lga, suppressed: true, ...state };
      const ranked = [...rows].sort((a, b) => b.per1000 - a.per1000);
      const groupRate = r.group === 'metro' ? state.metroRate : state.regionalRate;
      let ios = null;
      if (p.platform === 'all') {
        const i = views.vw_UsageByLga({ ...p, platform: 'ios', threshold: 0 }).find(x => x.code === p.lga);
        ios = i ? ratio(i.users, r.users) : null;
      }
      return {
        ...state,
        code: r.code, users: r.users, per1000: r.per1000, population: r.population,
        rank: ranked.findIndex(x => x.code === r.code) + 1, ranked: ranked.length,
        group: r.group === 'metro' ? 'metro' : 'regional', groupRate, iosShare: ios
      };
    },

    // The measure behind each target, for the scorecard. Numbers only.
    vw_Scorecard: p => {
      const ob = views.vw_OnboardingFunnel(p), lg = lgaRows(p);
      const metro = rateOf(lg.filter(r => r.group === 'metro')), regional = rateOf(lg.filter(r => r.group !== 'metro'));
      const pair = v => ({ current: v.current, previous: v.previous });
      return {
        days: win(dates, p.range).length,
        measures: {
          activeUsers: pair(views.vw_ActiveUsers(p)),
          newAccounts: pair(views.vw_NewAccounts(p)),
          transactionSuccess: { value: views.vw_TransactionSuccess(p).current },
          credentialChecks: pair(views.vw_CredentialChecks(p)),
          onboardingConversion: { value: ratio(ob[ob.length - 1].value, ob[0].value) },
          regionalReach: { value: ratio(regional, metro) }
        }
      };
    },

    // Total Azure cost of the platform in the period
    vw_PlatformCost: p => ({ current: sum(win(costTotal, p.range)), previous: sum(win(costTotal, p.range, 1)), daily: win(costTotal, p.range) }),

    // Unit costs: cost ÷ completed transactions, and cost ÷ daily active users
    vw_CostPerTransaction: unitCost('transactionsCompleted'),
    vw_CostPerActiveUser: unitCost('activeUsers'),

    // Cost per completed transaction for each day, with the same days of the previous period
    vw_CostPerTransactionDaily: p => {
      const done = series('transactionsCompleted', 'all');
      const wc = win(costTotal, p.range), wd = win(done, p.range), pc = win(costTotal, p.range, 1), pd = win(done, p.range, 1);
      return {
        dates: win(dates, p.range),
        costPerTransaction: wc.map((v, i) => ratio(v, wd[i])),
        cost: wc, completed: wd,
        previous: pc.length === wc.length ? pc.map((v, i) => ratio(v, pd[i])) : []
      };
    },

    // Calendar-month spend against budget, with a run-rate forecast for the month in progress
    vw_CostBudget: () => {
      const asAt = dates[dates.length - 1], month = asAt.slice(0, 7);
      const months = Object.keys(costByMonth).filter(m => m <= month).sort().slice(-6).map(m => ({
        month: m, cost: costByMonth[m], budget: budgetFor(m), complete: m < month
      }));
      const elapsed = Number(asAt.slice(8)), inMonth = daysIn(month), runDays = Number((costCfg.forecast || {}).runRateDays) || 14;
      const toDate = sum(costTotal.filter((v, i) => dates[i].slice(0, 7) === month));
      const runRate = avg(costTotal.slice(-runDays));
      return {
        currency: costCfg.currency || 'AUD', asAt, months,
        current: { month, toDate, budget: budgetFor(month), daysElapsed: elapsed, daysInMonth: inMonth,
          runRateDays: runDays, runRate, forecast: toDate + runRate * (inMonth - elapsed) }
      };
    },

    // Spend per Azure service in the period and the one before
    vw_CostByService: p => {
      const all = sum(win(costTotal, p.range));
      return Object.entries(costBy).map(([service, v]) => {
        const cost = sum(win(v, p.range));
        return { service, cost, previous: sum(win(v, p.range, 1)), share: ratio(cost, all) };
      }).filter(r => r.cost > 0 || r.previous > 0).sort((a, b) => b.cost - a.cost);
    },

    // Daily total cost, and the days when the total or one service went over its threshold
    vw_CostThresholdDays: p => {
      const th = costCfg.dailyThresholds || {}, d = win(dates, p.range), tot = win(costTotal, p.range), flagged = [];
      d.forEach((date, i) => {
        if (th.total && tot[i] > th.total) flagged.push({ date, service: 'All services', cost: tot[i], threshold: th.total });
        (th.services || []).forEach(s => {
          const v = costBy[s.service] ? costBy[s.service][pos.get(date)] : 0;
          if (v > s.threshold) flagged.push({ date, service: s.service, cost: v, threshold: s.threshold });
        });
      });
      return { dates: d, total: tot, totalThreshold: th.total || null, flagged: flagged.reverse() };
    },

    // Weekly sign-up cohorts: share still using the app n weeks later
    vw_RetentionCohorts: () => (retention.cohorts || []).map(c => ({ week: c.week, size: c.size, retained: c.retained })),

    // Linked vehicle registrations expiring in each of the next weeks
    vw_RenewalPipeline: () => {
      const start = new Date(dates[dates.length - 1] + 'T00:00:00Z');
      start.setUTCDate(start.getUTCDate() + 1);
      return (svc.renewalPipeline || []).map(w => {
        const d = new Date(start); d.setUTCDate(d.getUTCDate() + w.weekOffset * 7);
        return { weekStarting: d.toISOString().slice(0, 10), due: w.due, renewed: w.due * w.renewedShare, outstanding: w.due * (1 - w.renewedShare) };
      });
    },

    // How long finished transactions took, for one service
    vw_TransactionDuration: p => {
      const d = (svc.durations || []).find(x => x.key === p.txType) || svc.durations[0];
      const t = byType(p).find(x => x.key === d.key) || { completed: 0 };
      return { medianSeconds: d.medianSeconds, bands: svc.durationBands.map((label, i) => ({ label, transactions: t.completed * d.shares[i], share: d.shares[i] })) };
    },

    // Money collected through the app, per service
    vw_PaymentsByService: p => byType(p).map(t => {
      const pay = (svc.payments || []).find(x => x.key === t.key) || { averageAmount: 0 };
      return { key: t.key, label: t.label, payments: pay.averageAmount ? t.completed : 0, averageAmount: pay.averageAmount, totalAmount: t.completed * pay.averageAmount };
    }),

    // Share of active devices on the newest version, each day since release
    vw_AppVersionAdoption: () => {
      const a = ops.appAdoption, n = Math.min(a.ios.length, a.android.length);
      const days = Array.from({ length: n }, (_, i) => { const d = new Date(a.released + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
      return { version: a.version, released: a.released, dates: days, ios: a.ios.slice(0, n), android: a.android.slice(0, n) };
    },

    // Share of active users with each notification setting on
    vw_NotificationSettings: p => (ops.notificationSettings || []).map(n => {
      const ios = platformShare(p.range, 'ios');
      return { label: n.label, share: p.platform === 'ios' ? n.ios : p.platform === 'android' ? n.android : n.ios * ios + n.android * (1 - ios), ios: n.ios, android: n.android };
    }),

    // Response time and error rate for calls to each backend, last 30 days
    vw_ProviderPerformance: () => {
      const last = dates.slice(-30), f = ops.incidentFactors;
      return (ops.providerPerformance || []).map((pr, k) => {
        const inc = (ref.providers.find(x => x.name === pr.name) || {}).incidents || {};
        const daily = last.map((d, i) => {
          const wobble = 1 + 0.07 * Math.sin(i * 1.7 + k * 2.1) + 0.04 * Math.sin(i * 0.6 + k);
          const hit = f[inc[d]];
          return { date: d, medianMs: pr.medianMs * wobble * (hit ? hit.latency : 1), errorRate: hit ? hit.errorRate : pr.errorRate * (0.8 + 0.4 * Math.abs(Math.sin(i * 2.3 + k))) };
        });
        const med = [...daily.map(x => x.medianMs)].sort((x, y) => x - y)[Math.floor(daily.length / 2)];
        const worst = daily.reduce((m, x) => (x.medianMs > m.medianMs ? x : m), daily[0]);
        return { name: pr.name, medianMs: med, p95Ms: pr.p95Ms * (worst.medianMs / pr.medianMs > 2 ? 1.6 : 1), errorRate: avg(daily.map(x => x.errorRate)),
          worstDay: { date: worst.date, medianMs: worst.medianMs }, daily: daily.map(x => Math.round(x.medianMs)) };
      });
    }
  });

  return {
    label: 'Mock data',
    asAt: dates[dates.length - 1],
    async query(view, params) {
      const fn = views[view];
      if (!fn) throw new Error(`The mock source has no view called ${view}`);
      return fn(params);
    }
  };
}
