/** Data model tab: static description of the assumed schema and data flow. */
const MODEL = [
  ['Users', 'use', ['UserId (PK)', 'CreatedAt', 'IdentityVerifiedAt', 'Status', 'LastLoginAt'], 'Name, date of birth and contact details stay out of analytics.'],
  ['UserDevices', 'use', ['DeviceId (PK)', 'UserId (FK)', 'Platform', 'OsVersion', 'AppVersion', 'RegisteredAt', 'LastSeenAt']],
  ['UsageHistories', 'use', ['UsageId (PK)', 'UserId (FK)', 'DeviceId (FK)', 'Feature', 'EventType', 'OccurredAt']],
  ['LocationHistories', 'use', ['LocationId (PK)', 'UserId (FK)', 'Latitude', 'Longitude', 'RecordedAt'], 'Used only after matching to council areas in Fabric. Raw coordinates never reach the dashboard.'],
  ['Credentials', 'use', ['CredentialId (PK)', 'UserId (FK)', 'CredentialTypeId (FK)', 'CredentialProviderId (FK)', 'Status', 'AddedAt', 'ExpiresAt']],
  ['ValidationHistories', 'use', ['ValidationId (PK)', 'CredentialId (FK)', 'Method', 'Result', 'ValidatedAt']],
  ['Transactions', 'use', ['TransactionId (PK)', 'UserId (FK)', 'TransactionTypeId (FK)', 'TransactionStatusId (FK)', 'ServiceProviderId (FK)', 'Amount', 'FailureReason', 'CreatedAt', 'CompletedAt']],
  ['Notifications', 'use', ['NotificationId (PK)', 'UserId (FK)', 'Type', 'SentAt', 'DeliveredAt', 'OpenedAt', 'ActionTakenAt']],
  ['FuelExemption…Registrations', 'use', ['RegistrationId (PK)', 'IndividualId / BusinessId (FK)', 'CategoryId (FK)', 'Status', 'StartedAt', 'SubmittedAt', 'DecidedAt']],
  ['OwnedRegistrations · AddedRegistrations', 'use', ['RegistrationId (PK)', 'UserId (FK)', 'ExpiryDate', 'LinkedAt'], 'Future item: registrations due to expire.'],
  ['PortalStatuses', 'use', ['PortalStatusId (PK)', 'ServiceProviderId (FK)', 'Status', 'CheckedAt']],
  ['Lookups', 'lk', ['CredentialTypes', 'CredentialProviders', 'TransactionTypes', 'TransactionStatuses', 'ServiceProviders', 'OriginatorSystems', 'FuelExemptionCategories / Subcategories / Classes'], 'Small reference tables that give names to IDs.'],
  ['Kept out of dashboards', 'no', ['UserAttachmentHashes', 'CosmosUsers', 'HttpRequestDefinitions', 'UserConfigurations'], 'Sensitive or configuration data. Aggregate heavily if ever needed.']
];

const TAG = { use: 'Used', no: 'Excluded', lk: 'Lookup' };

export function renderModel(panel) {
  panel.innerHTML = `<div class="grid">
    <section class="card s12" aria-labelledby="flow-t">
      <div class="chead"><div class="t"><h3 id="flow-t">How data reaches the dashboard</h3><p class="sub">One-way flow. The browser never connects to a database.</p></div></div>
      <ol class="flow" style="list-style:none;margin:0;padding:0">
        <li class="fnode"><small>Source</small><b>SQL Server / Azure SQL</b><span>mySA GOV app database</span></li>
        <li class="fnode"><small>Ingest</small><b>Fabric Mirroring or pipeline</b><span>Copies tables, including temporal history tables</span></li>
        <li class="fnode"><small>Store</small><b>Lakehouse / Warehouse</b><span>Raw copies, then cleaned tables. Locations matched to councils here.</span></li>
        <li class="fnode"><small>Model</small><b>SQL views per item</b><span>vw_ActiveUsers, vw_UsageByLga …</span></li>
        <li class="fnode"><small>Serve</small><b>Fabric GraphQL API or backend API</b><span>Returns JSON aggregates only</span></li>
        <li class="fnode"><small>Show</small><b>This dashboard</b><span>HTML, CSS and JavaScript modules</span></li>
      </ol>
    </section>
    <section class="card s12" aria-labelledby="tables-t">
      <div class="chead"><div class="t"><h3 id="tables-t">Assumed tables and columns</h3><p class="sub">Table names are real. Column names are guesses to confirm against the Entity Framework models.</p></div></div>
      <div class="tcards">${MODEL.map(([n, k, cols, note]) => `<div class="tcard"><h4>${n}</h4><span class="tag ${k}">${TAG[k]}</span>
        <ul>${cols.map(c => `<li>${c.replace(/\((PK|FK)\)/, '<span class="k">($1)</span>')}</li>`).join('')}</ul>${note ? `<p class="sub">${note}</p>` : ''}</div>`).join('')}</div>
    </section>
    <section class="card s6" aria-labelledby="assume-t">
      <div class="chead"><div class="t"><h3 id="assume-t">Assumptions to confirm</h3></div></div>
      <ul class="list">
        <li>Users has an identity-verified timestamp, or another way to tell verified accounts apart.</li>
        <li>UsageHistories logs app activity per user and device. If not, active users must come from app analytics.</li>
        <li>LocationHistories stores latitude and longitude with a timestamp, recorded during app use.</li>
        <li>Transactions keeps a failure reason or error code.</li>
        <li>Notifications records delivered and opened times.</li>
        <li>ValidationHistories stores the check method and result.</li>
        <li>PortalStatuses is a periodic health check per service provider.</li>
      </ul>
    </section>
    <section class="card s6" aria-labelledby="cant-t">
      <div class="chead"><div class="t"><h3 id="cant-t">What this database can't show</h3></div></div>
      <ul class="list">
        <li>Screen-by-screen journeys, such as someone viewing the fee screen and leaving. That needs app event tracking, for example Azure Application Insights or Firebase.</li>
        <li>App crashes, load times and API latency. These come from monitoring tools, not the app database.</li>
        <li>App store ratings and downloads.</li>
      </ul>
      <p class="sub">The funnels on the Journeys tab use records the database already keeps, so they work today. Add event tracking later for screen-level detail.</p>
    </section>
  </div>`;
}
