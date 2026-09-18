# Wix order delivery

The Orders table and receiver are implemented. No Wix automations have been created or enabled. The owner previously requested permission before changing Wix; ask before activation.

Configuration factory: `scripts/wix-order-automation.mjs`.
The exact factory output was validated using POST https://www.wixapis.com/automations-service/v2/automations/validate on 2026-09-14.

Validated sites:
- US- Rebecca Aldernet: 110742f0-dc02-40f3-8ab1-59a5890fab9d
- Rebecca Aldernet: faa072bb-65e2-4eeb-95d8-6d5b668a8282
- EU- Rebecca Aldernet: 093b21f6-f1d6-43cb-8b04-a6c9f1b6707e
- Rebecca Aldernet Designs: 1b7234c3-95a4-4cbe-9b6c-63e6cc20c585
- The Rebecca Aldern 1: 5800da1e-a509-4fe4-a595-4e4d17ea717b

Not available: WebMart (77e0d747-f34f-4f78-80dd-e790cccd8c4f) and The Rebecca Aldernet (0c615713-ae45-4d53-b9ac-f685a220fe71). Wix validation returned NOT_FOUND for the order trigger's app. Do not install apps without authorization.

After approval:
1. Generate independent strong random per-site tokens. Store the JSON site-ID-to-token map as secret Sites runtime environment variable WIX_ORDER_SECRETS. Never place tokens in Git, URL query strings, logs or frontend.
2. Read current Wix automation configuration first to avoid duplicates after retries. Validate and create each automation using the factory and official create-automation docs. Creation endpoint: POST https://www.wixapis.com/automations-service/v2/automations. Use each exact approved site ID. Record returned automation IDs.
3. Store only successfully activated site IDs as WIX_ORDERS_ENABLED_SITES (JSON array) and deploy/reconcile runtime revision as Sites requires. Never mark a failed site connected.
4. Test with a separate, clearly identified test event only if authorized; never create a real customer order for testing. Alternatively verify the next genuine event's delivery and table row.

Receiver: POST /api/orders/receive accepts flat mapped fields. The order ID and site ID form the primary key. Repeated Order placed delivery does not duplicate or overwrite rows. It stores only normalized customer/order details, excluding payment credentials. Details are snapshots as placed, not a continuous fulfillment/refund status feed. It receives events even when the RA Studio tab is closed. The table checks saved data every five seconds while visible.

Members need the View website orders permission. New permission follows the existing member defaults and can be disabled by the owner. All GETs require active membership. The webhook requires its per-site secret independently of browser sign-in.
