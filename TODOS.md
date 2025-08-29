### TODOS & ISSUES TO RESOLVE

MUSTS

- Demo companies have null assigned firm ids
- URL resolves to null subdomain in frontend, should solve. at worst resolve to app
- Backup database for postgres
- Re-enable deployment protection once we push to production;

CAN DELAY

- Implement monitoring - grafana, prometheus etc, and maybe versioning too
- Add concurrency to deploy-staging.yml : { group: staging, cancel-in-progress: true }.
