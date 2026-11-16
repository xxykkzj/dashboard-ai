# mySA GOV Insights — dashboard prototype

An interactive leadership dashboard for the mySA GOV data analytics platform, built with plain HTML, CSS and JavaScript modules. No framework and no build step. Charts are hand-drawn SVG and HTML; the council map uses D3, which is included in the folder.

## Documentation

New to the code? Start with the documentation site in `docs/`. With the local server running, open `http://localhost:<port>/docs/` or use the **Docs** link at the top of the dashboard. It has nine pages: getting started, how the app works, an item catalog built from the live registry, a component catalog with live examples, design tokens, a mock data guide, recipes, accessibility and conventions, and a glossary. When you add a view, add it to `VIEWS` in `docs/items.mjs` so the catalog shows its shape.


## Marking items as wanted (for demos)

Each card's id at the bottom right (for example ITM-05) is a star button. Select it to mark that item as **wanted**; select it again to unmark. The **Wanted** button in the masthead shows the count and opens a list where you can jump to an item, remove it, copy the list as text, show only wanted cards on the dashboard, or clear all (select Clear all twice).

Marks are saved in the browser's localStorage (`mysagov-insights:wanted`), so they survive a refresh but stay on that browser and computer. Code: `js/wanted.mjs`.

## What leadership sees

- **Overview** opens with *Performance against targets*: a count of measures On track, Watch and Action, and each measure drawn against its target and action level. Below it are the headline figures, daily trends, retention by sign-up week and the value estimate.
- **Targets** appear on the headline figures, as dashed lines on charts, and in the scorecard.
- **Events** (the licence-renewal campaign, the licensing system outage) are shaded and labelled on time charts and listed on the scorecard.
- **Value delivered** estimates the cost avoided by moving transactions from counters, phone and the website to the app.
- **Location** shows use on a real map of South Australian council areas, opening on Adelaide and the populated south, with inner Adelaide enlarged beside it.
- **Journeys** are drawn as funnels, so the narrowing is the story.
- **Drill-down**: select a council on the map or in the lists to fill the council profile; select a service to open its completion funnel.
- **Present** (top right) steps through seven full-width slides with fixed titles. Right arrow, Page Down or Space moves on; Left arrow or Page Up goes back; Home and End jump; F toggles full screen; Esc closes. Filters, hover details and the map all still work on slides. When focus is inside the map, arrow keys move between councils, so use Page Down or the Next button there.
- **Dark theme / Light theme** (top right) overrides the system setting and is remembered on that device.

Links can point at one item: `#location/ITM-22` opens the Location tab and jumps to the map.

All figures are **mock data** and the column names are **assumptions** based on the app database's table list. Confirm both before building for real (see the Data model tab).

## Design

Every tab opens on a navy cover band with the tab's title, the filters and a line drawing of the state's council boundaries (drawn from the same boundary file as the map). The first row of content overlaps the band. Headings and big figures use the serif; controls and labels use the sans. Gulf blue is for data, copper for the second series and the brand moments, and green, amber and red are kept for status, always with a shape and a word. All of it is set in `css/tokens.css`.

## Items added in this version

| Item | Tab | What it shows |
|---|---|---|
| ITM-29 Retention by sign-up week | Overview | Cohort grid: share of each week's new accounts still active in later weeks |
| ITM-31 Time to complete a transaction | Services | Completed transactions by time band for the selected service, with the median |
| ITM-32 Payments collected | Services | Value and average of payments by service |
| ITM-30 Registrations due to expire | Services | Linked registrations expiring in each of the next eight weeks, renewed or not |
| ITM-33 Backend response times | Service health | Median, 95th percentile, error rate and daily trend per backend |
| ITM-34 Uptake of the newest app version | Service health | Share of devices on the newest version each day since release, by platform |
| ITM-35 Notification settings | Service health | Share of active users with each notification setting on |

### Cost tab

| Item | What it shows |
|---|---|
| ITM-39 Cost per successful transaction by day | Daily platform cost ÷ completed transactions, against target and the previous period, with events shaded |
| ITM-40 Monthly spend against budget | Cost per calendar month against the budget, with a run-rate forecast for the month in progress (labelled as an estimate) |
| ITM-36 Platform cost | Azure cost in the period and the change on the previous period |
| ITM-37 Cost per successful transaction | Period cost ÷ completed transactions, against a target ceiling |
| ITM-38 Cost per active user a day | Period cost ÷ the sum of daily active users, against a target ceiling |
| ITM-41 Spend by service | Azure services by cost, share of spend and change on the previous period |
| ITM-42 Daily cost and days over threshold | Total cost each day, and the days when the total or a service passed a set daily amount |

Cost is mock data in the shape of an Azure Cost Management export (`data/mock/azure-cost.json`, generated by `tools/generate-mock.mjs` using `data/mock/samples/azure-cost-sample.csv` as a guide to services, meters and value ranges). Cost is not split by phone type, so these items always show all platforms; the budget item uses calendar months and ignores the period filter. In production the export (actual cost or FOCUS, daily) is scheduled to ADLS, read through a Lakehouse shortcut and joined to the app metrics in Fabric.

Their data is invented, and several columns are assumptions (for example `PortalStatuses.ResponseMs`, `Transactions.RegistrationId`, `UserConfigurations.SettingKey`). Each item's **How it's built** panel says which.

## Run it locally

Chrome blocks JavaScript modules and JSON files when a page is opened straight from disk, so serve the folder with any static server:

```bash
# Node (no install needed)
npx serve .

# or Python
python3 -m http.server 8080

# or VS Code: right-click index.html → "Open with Live Server"
```

Then open the address it prints (for example http://localhost:3000 or http://localhost:8080).

## Folder structure

```
index.html                 page shell: header, filters, tabs
css/
  tokens.css               colours, fonts, sizes, motion (light + dark). Restyle here.
  base.css                 reset, layout grid, focus styles, reduced motion
  components.css           masthead, cards, briefing, status, charts, funnel, tables,
                           tile map, heat grid, council profile, presentation mode
js/
  main.mjs                 boots the app, routing, filters, drill-down, theme, re-rendering
  present.mjs              presentation mode
  config.mjs               mock vs API, paths, privacy threshold
  state.mjs                shared filter state
  data/
    source.mjs             picks the data source
    mock-source.mjs        answers each view from the JSON files
    api-source.mjs         calls the real API (same interface)
  vendor/                  D3 and topojson-client, used only by the map
  ui/                      charts, council map (geomap), tile map, card shell, status and targets, formatting, motion
  items/                   reporting items, one file per tab; index.mjs lists tabs and slides
data/
  mock/                    mock data — edit and refresh
  reference/lga.json       council areas: names, population, ABS codes, tile positions
  reference/sa-lga-2023.topo.json   council boundaries for the map (ABS, CC BY 4.0)
docs/                      documentation site (start at docs/index.html)
tools/generate-mock.mjs    regenerates the daily mock data and the Azure cost data from parameters
```

## Change the mock data

Edit a file in `data/mock/`, save, and refresh the browser.

| File | What it controls |
|---|---|
| `daily-metrics.json` | One row per day per platform: active users, new accounts, credentials added, checks, transactions, notifications. Drives almost every item. |
| `reference.json` | Funnel conversion rates, transaction types, credential types, failure reasons, backend incidents (by date), app versions, notification rates. |
| `lga-activity.json` | How likely residents of each council are to use the app (`adoptionWeight`) and their iPhone share. Drives the location map. |
| `usage-by-hour.json` | The shape of a typical week, used by the day × hour heatmap. |
| `targets.json` | Target and action level for each headline measure. Drives every status, the dashed target lines and the headline. |
| `events.json` | Campaigns and incidents (`kind`, `from`, `to`, `label`, `note`). Shaded on charts and listed on the scorecard. |
| `retention.json` | Weekly sign-up cohorts: size and the share still using the app each week after. |
| `services-detail.json` | Registrations due to expire by week, time-to-complete bands and medians per service, average payment per service. |
| `operations.json` | Newest app version uptake by day and platform, notification settings switched on, backend response times and error rates. |
| `azure-cost.json` | Azure cost, one row per day per service meter, in the column shape of a Cost Management export (`UsageDate`, `PublisherType`, `ChargeType`, `ServiceName`, `ServiceTier`, `Meter`, `PartNumber`, `CostUSD`, `Cost`, `Currency`). Each row is an array in the order of `columns`. Drives the Cost tab. Generated. |
| `cost-settings.json` | Monthly budget (`monthlyBudget`, `budgetByMonth`), forecast run-rate days, and the daily cost thresholds for all services and for single services. |
| `value.json` | Assumptions for the value estimate: unit cost per channel, where app transactions would otherwise have happened, other-channel volumes, minutes saved per counter visit. |
| `../reference/lga.json` | Council names, populations and positions on the tile map. |

Target fields: `key` (which measure), `basis`, `target`, `action`. A measure is On track at or above `target`, Action below `action`, and Watch in between. `basis` is `value` (compare the rate or ratio itself), `perDay` (period total ÷ days) or `growth` (change on the previous period; 0.01 = 1%). Daily-volume targets are skipped when one phone type is selected, because they are set for all platforms together. Add `direction: "lower"` for a measure where lower is better (the two unit costs): it is On track at or below `target` and Action above `action`. `unit: "cents"` shows a dollar value in cents. The targets, unit costs and channel volumes are invented placeholders; agree real ones before showing figures outside the team.

Examples:
- Move a target: change `target` for `transactionSuccess` in `targets.json` and watch the headline, scorecard and chart line change.
- Add an event: add an entry to `events.json`. It appears on any time chart whose period includes it.
- Change the budget or a cost threshold: edit `monthlyBudget` or `dailyThresholds` in `cost-settings.json`.
- Change the cost scenario: edit `COST` in `tools/generate-mock.mjs` (services, daily amounts, Databricks spikes, extra cost on incident days) and rerun it. Daily metrics are not changed by this.
- Change the value estimate: edit `costPerTransaction` in `value.json`.
- Mark a backend outage: add `"2026-11-12": "down"` to a provider's `incidents` in `reference.json`.
- Make a funnel step worse: lower its `rate` in `reference.json`.
- Simulate a campaign: in `tools/generate-mock.mjs`, add a date range under `PARAMS.campaigns`, then run `node tools/generate-mock.mjs` (or `npm run mock`).

## Switch to real data

1. Build one SQL view per item in Fabric. Each card's **How it's built** panel shows the view name and a starting SQL query.
2. Expose the views through an API that returns JSON: Fabric's API for GraphQL behind a gateway, or a small backend (for example an Azure Function). The browser must never hold database credentials.
3. In `js/config.mjs`, set `dataSource: 'api'` and `api.baseUrl`. You can also test with `?source=api` in the address bar.

Each item calls `GET {baseUrl}/{view}?from=YYYY-MM-DD&to=YYYY-MM-DD&range=30&platform=ios` (platform is left out for "All"). Responses must match the shapes below, which are what `mock-source.mjs` returns.

### Data contract

| View | Response shape |
|---|---|
| `vw_ActiveUsers`, `vw_NewAccounts`, `vw_CredentialChecks`, `vw_TransactionSuccess` | `{ current, previous, daily: number[] }` |
| `vw_DailyActiveUsersByPlatform` | `{ dates: string[], ios?: number[], android?: number[] }` |
| `vw_NewAccountsByWeek` | `{ daily: boolean, labels: string[], values: number[] }` |
| `vw_OnboardingFunnel`, `vw_TransactionFunnel` (+`txType`), `vw_ReminderFunnel`, `vw_FuelExemptionFunnel` | `[{ label, source, value }]` in step order |
| `vw_CredentialsByType` | `[{ label, active, added }]` |
| `vw_TransactionsByType` | `[{ key, label, finished, completed, failed }]` (`key` matches the service selector) |
| `vw_CredentialChecksDaily` | `{ dates, checks: number[], failed: number[] }` |
| `vw_CheckMethods` | `[{ label, checks, share }]` |
| `vw_FailureReasons` | `[{ reason, code, failures, share }]` |
| `vw_FuelExemptionByCategory` | `[{ label, individuals, businesses }]` |
| `vw_ProviderAvailability` | `[{ name, description, uptime, days: [{ date, status: 'up' | 'degraded' | 'down' }] }]` |
| `vw_FailedTransactionsDaily` | `{ dates, failed: number[] }` |
| `vw_AppVersions` | `[{ version, devices, share }]` |
| `vw_NotificationPerformance` | `[{ type, sent, delivered, opened, acted }]` (rates as 0–1) |
| `vw_UsageByLga` (+`threshold`) | `[{ code, users, per1000 }]`, leaving out councils below the threshold |
| `vw_UsageByHour` | `{ days: string[7], matrix: number[7][24] }` |
| `vw_Targets` | `[{ key, label, basis: 'value' | 'perDay' | 'growth', target, action, direction?: 'lower', unit?: 'cents' }]` |
| `vw_Events` | `[{ id, kind: 'campaign' | 'incident', from, to, label, note, inPeriod: 'current' | 'previous' }]` for events overlapping this period or the one before |
| `vw_TransactionSuccessDaily` | `{ dates, rate: number[], finished: number[], failed: number[], previousRate: number[] }` (`previousRate` lines up day for day, or is empty) |
| `vw_ChannelShift` | `{ currency, costPerTransaction: { counter, phone, website, app }, minutesSavedPerCounterVisit, rows: [{ key, label, appCompleted, otherChannels, appShare, counterAvoided, phoneAvoided, costAvoided }], totals: { appCompleted, counterAvoided, phoneAvoided, costAvoided, appShare, previousCostAvoided, previousAppShare } }` |
| `vw_LgaProfile` (+`threshold`, `lga`) | State picture `{ code: null, stateRate, metroRate, regionalRate, stateUsers, councils, hidden }`; with `lga` adds `{ code, users, per1000, population, rank, ranked, group, groupRate, iosShare }`, or `{ code, suppressed: true }` for a hidden council |
| `vw_Scorecard` (+`threshold`) | `{ days, measures: { activeUsers, newAccounts, credentialChecks: { current, previous }, transactionSuccess, onboardingConversion, regionalReach: { value } } }`, keyed like `vw_Targets` |
| `vw_RetentionCohorts` | `[{ week, size, retained: number[] }]` where `retained[n]` is the share active n weeks after sign-up (`retained[0]` = 1) |
| `vw_RenewalPipeline` | `[{ weekStarting, due, renewed, outstanding }]` for the next eight weeks |
| `vw_TransactionDuration` (+`txType`) | `{ medianSeconds, bands: [{ label, transactions, share }] }` |
| `vw_PaymentsByService` | `[{ key, label, payments, averageAmount, totalAmount }]` |
| `vw_AppVersionAdoption` | `{ version, released, dates: string[], ios: number[], android: number[] }` (shares 0–1) |
| `vw_NotificationSettings` | `[{ label, share, ios, android }]` (shares 0–1) |
| `vw_ProviderPerformance` | `[{ name, medianMs, p95Ms, errorRate, worstDay: { date, medianMs }, daily: number[] }]` for the last 30 days |
| `vw_PlatformCost` | `{ current, previous, daily: number[] }` in AUD |
| `vw_CostPerTransaction`, `vw_CostPerActiveUser` | `{ current, previous, daily: number[] }` in AUD per completed transaction, and per active user per day. Always all platforms |
| `vw_CostPerTransactionDaily` | `{ dates, costPerTransaction: number[], cost: number[], completed: number[], previous: number[] }` (`previous` lines up day for day, or is empty) |
| `vw_CostBudget` | `{ currency, asAt, months: [{ month: 'YYYY-MM', cost, budget, complete }], current: { month, toDate, budget, daysElapsed, daysInMonth, runRateDays, runRate, forecast } }` for the last six calendar months. Ignores the filters |
| `vw_CostByService` | `[{ service, cost, previous, share }]`, largest first |
| `vw_CostThresholdDays` | `{ dates, total: number[], totalThreshold, flagged: [{ date, service, cost, threshold }] }`, newest flagged day first; `service` is `'All services'` for the total |

The dashboard shows figures only. It does not write commentary, headlines or recommendations; status comes from comparing a measure with the thresholds in `targets.json`, and nothing else is interpreted.

## Add a reporting item

1. Add an object to the tab file in `js/items/` with `id`, `tab`, `span` (`s3`/`s4`/`s6`/`s8`/`s12`), `title`, `sub`, `view`, `build` (tables, fields, logic, sql) and `render(host, data, state, ctx)`.
2. Add the view to `views` in `js/data/mock-source.mjs` (and later to the real API).
3. Use the helpers in `js/ui/charts.mjs`: `kpi`, `lineChart`, `barChart`, `hbars`, `funnel`, `table`, `heatGrid`. `lineChart` and `barChart` take `events` and `target`; `lineChart` takes `compare` for the previous period; an `hbars` row with `go: { hash, set, label }` becomes a drill-down link. `js/ui/status.mjs` has `evaluate` and `statusChip` for targets.
4. To put the item on a slide, add its id and a span to a slide in `STORY` in `js/items/index.mjs`. Slide titles are fixed text.

Optional item fields: `also: { name: 'vw_Other' }` loads extra views with the same parameters and passes them as the fifth argument, `render(host, data, state, ctx, more)` (used for `vw_Targets` and `vw_Events`); `kind: 'kpi'` or `'hero'` changes the card's look; `params(state, ctx)` adds query parameters, `deps: ['key']` re-renders when that state key changes, `control(state)` adds a card-level control (use `segControl` or `selectControl` from `js/ui/card.mjs`), and `global: false` ignores the period and platform filters.

## The council map

`js/ui/geomap.mjs` draws the map as plain SVG with D3. There is no basemap and no tile server, so nothing is fetched from outside the site.

- **Boundaries**: `data/reference/sa-lga-2023.topo.json`, Local Government Areas 2023 from the ABS Australian Statistical Geography Standard Edition 3, © Commonwealth of Australia, licensed CC BY 4.0. Keep the attribution line under the map. Each feature carries `code` (matches `lga.json`), `absCode` and `name`.
- **Projection**: Lambert conformal conic with standard parallels 28°S and 36°S, centred on 135°E.
- **Views**: opens on the populated south (Port Lincoln to Mount Gambier). *Whole state* brings in the outback; *Populated areas* returns. Drag to move; Ctrl or ⌘ + scroll, pinch, or the + and − buttons zoom. On touch screens only the buttons zoom, so the page still scrolls.
- **Inner Adelaide** is enlarged beside the main map, and a dashed box on the main map shows the area it covers. Councils are named on the enlargement where the name fits, otherwise by code; hover, focus or the table gives every name.
- **Labels**: towns, gulfs and the Adelaide box label are placed so they never overlap. Earlier entries in `TOWNS` win; each has a minimum zoom.
- **Keyboard**: each map is one Tab stop. Arrow keys move to the nearest council in that direction, Enter or Space selects it and fills the council profile, and focus is drawn as a ring above the map.
- **Show: Map | Tiles** switches to the equal-size tile map, which is better when every council needs the same visual weight.
- **Libraries**: D3 7.9.0 and topojson-client 3.1.0 are in `js/vendor` and loaded in `index.html`. If either is missing the item falls back to a short error and the tile map still works.

### Swapping in better boundaries

The file in this prototype is heavily simplified (about 6,000 points for the state) to keep it small, so small inner-Adelaide councils look angular. For production, build a new file from the ABS download:

```bash
# 1. Download "Local Government Areas - 2023 - Shapefile" from the ABS ASGS Edition 3
#    digital boundary files page and unzip it.
# 2. Keep South Australia, simplify, and write TopoJSON (npm i -g mapshaper)
mapshaper LGA_2023_AUST_GDA2020.shp \
  -filter 'STE_NAME21 === "South Australia" && !/No usual address|Migratory/.test(LGA_NAME23)' \
  -simplify weighted 4% keep-shapes \
  -clean \
  -rename-fields absCode=LGA_CODE23,name=LGA_NAME23 \
  -filter-fields absCode,name \
  -rename-layers lga \
  -o format=topojson quantization=1e5 data/reference/sa-lga-2023.topo.json
```

Then add the dashboard's short `code` to each feature by matching `absCode` against `data/reference/lga.json` (a few lines of Node, or `-join lga-codes.csv keys=absCode,absCode` in mapshaper). Check the field names against the file you download, as the ABS changes them between editions. Raise the simplify percentage until inner Adelaide looks right; 4 to 8% is usually under 400 KB. The layer must be called `lga`. Nothing in the code needs to change: label positions, the inset and keyboard order are all worked out from the shapes.

## The funnels

`funnel()` in `js/ui/charts.mjs` draws each step as a layer that narrows from its own share of the start to the next step's share, so the layers join into one funnel. Widths are true to the data; heights are equal. The line on each boundary gives the share and number that stopped there, and the largest drop has a red top edge and a "Largest drop" tag. The list carries a text summary of every step for screen readers.

## Accessibility

- Skip link, landmarks, one `h2` per tab and `aria-current` on the active tab
- All controls are real buttons, selects and links, with visible focus styles
- Filter changes are announced through a live region
- Every chart has a text summary for screen readers; tables have captions
- Each council map (main and inner Adelaide) is one Tab stop, arrow keys move between councils, focus is ringed above the map, and **Show as table** gives the same data as text
- Status never relies on colour alone: each status has its own shape and word, availability bars differ in height, and hidden areas are hatched
- Drill-down rows are real links and buttons
- Presentation mode is a dialog: the page behind is inert, Esc closes it and focus returns to the Present button; slide changes are announced
- Animations respect `prefers-reduced-motion`
- Light and dark themes follow the system setting, with a manual switch

Test with keyboard only, NVDA or VoiceOver, and Chrome Lighthouse before release.

## Location data and privacy

The map and council profile assume `LocationHistories` records where the app was used. In production:
- match coordinates to a council area during ingest in Fabric and drop the raw coordinates
- serve only council-level counts, and leave out councils with fewer than `suppressionThreshold` users (10 by default)
- confirm the collection notice covers analytics use, and complete a privacy impact assessment under the SA Information Privacy Principles

Populations in `data/reference/lga.json` are rounded examples. Replace them with ABS Estimated Resident Population figures.

## Deploy

It is a static site, so any static host works.

- **Azure Static Web Apps** fits the Azure and Fabric stack and supports Microsoft Entra ID sign-in. `staticwebapp.config.json` sets the right file types; add an auth rule before using real data.
- **GitHub Pages**: push the folder to a repository and enable Pages. Fine for the mock-data prototype; don't host real government data on a public site.

Keep any deployment with real data behind organisational sign-in.
