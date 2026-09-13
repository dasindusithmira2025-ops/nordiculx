# Test login credentials

These credentials are created only by `npm run db:seed` in a non-production
database. They are not production accounts. Reseed the local database before
using them if the fixtures may have changed.

## Staff — `/admin/login`

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@nordiclux.test` | `DevOwner!2026` |
| Product manager | `products@nordiclux.test` | `DevOwner!2026` |
| Order manager | `orders@nordiclux.test` | `DevOwner!2026` |
| Support | `support@nordiclux.test` | `DevOwner!2026` |
| Content editor | `editor@nordiclux.test` | `DevOwner!2026` |

## Customers — `/account/login`

| Name | Email | Password |
| --- | --- | --- |
| Amaya Perera | `customer@nordiclux.test` | `DevCustomer!2026` |
| Nuwan Silva | `nuwan@nordiclux.test` | `DevCustomer!2026` |
| Ishara Fernando | `ishara@nordiclux.test` | `DevCustomer!2026` |

`reader@nordiclux.test` is a newsletter-only fixture, not a user account, so
it cannot sign in and has no password.

Source: `scripts/seed.ts`; the end-to-end suite uses these same seeded
credentials.
