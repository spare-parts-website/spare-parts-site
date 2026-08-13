# غيار ماركت / Spare Parts Site — Codex Handoff

## How to continue

Use the real repository:
C:\Users\HP\Documents\Codex\spare-parts-site-online

The user wants Codex to:
1. Inspect the existing implementation.
2. Edit the files directly.
3. Preserve unrelated changes and untracked files.
4. Run npm run lint and npm run build.
5. Commit only intended files.
6. Push with: git push origin HEAD:main
7. Report the commit hash and Vercel deployment status.

Paste this after the handoff in a new chat:
"Use the real project at C:\Users\HP\Documents\Codex\spare-parts-site-online. Make the requested change directly, verify it, commit only intended files, and push to GitHub main so Vercel deploys it automatically."

Do not add these existing untracked files unless explicitly requested:
- AGENTS.md
- CLAUDE.md
- src/components/marketplace-ui.tsx

Do not expose or commit secrets. Do not reset, checkout, or delete unrelated work.

## Repository and deployment

GitHub: https://github.com/fakepixelpro/spare-parts-site.git
Production branch: main
Vercel is connected to GitHub main.
Latest known production commit: 3a1c887 Refresh brand logo for light and dark themes
Current local branch: codex/remake-preview
A push to GitHub main should trigger Vercel automatically.

Important: do not use the old worktree:
C:\Users\HP\Documents\Codex\2026-08-08\he\work\spare-parts-remake-preview
It previously pushed to a local mirror instead of GitHub. Always use the real checkout above.

Useful commands:
git status --short --branch
git remote -v
git log -5 --oneline --decorate
npm run lint
npm run build
git add only intended files
git commit -m "Describe the change"
git push origin HEAD:main

The Windows dev script uses Unix tee and may fail. For local testing, use:
Start-Process -WindowStyle Hidden -FilePath 'npx.cmd' -ArgumentList 'next','dev','-p','3000','--hostname','127.0.0.1' -WorkingDirectory 'C:\Users\HP\Documents\Codex\spare-parts-site-online'

## Technology

- Next.js App Router, Next 16
- React 19 and TypeScript
- Tailwind CSS v4
- shadcn/Radix UI
- Prisma with PostgreSQL/Supabase
- Supabase Storage for uploads
- Auth/session helpers
- Resend email
- Client-side app view system controlled through the app store

Important files:
- src/app/layout.tsx: metadata, favicon, theme
- src/app/globals.css: global and responsive CSS
- src/components/header.tsx: navigation, logo, notifications
- src/components/footer.tsx: footer branding
- src/components/views/home-view.tsx: homepage and featured part cards
- src/components/views/parts-view.tsx: marketplace part cards
- src/components/views/store-view.tsx: seller store page
- src/components/views/stores-view.tsx: stores listing
- src/components/views/wishlist-view.tsx: favorite stores
- src/components/views/part-view.tsx: part detail
- src/components/views/shop-dashboard-view.tsx: seller dashboard
- src/components/views/admin-dashboard-view.tsx: admin dashboard
- src/components/image-upload.tsx: image upload UI
- src/app/api/upload/route.ts: upload processing
- src/app/api/parts/route.ts: part CRUD
- src/app/api/stores/route.ts: store listing
- src/app/api/shop/store/route.ts: seller store update
- src/app/api/notifications/route.ts and notify/route.ts: notifications/email
- src/app/api/orders/route.ts: orders
- src/app/api/chat/route.ts: messages
- src/app/api/wishlist/route.ts: favorites
- src/lib/store.ts: app state and navigation
- src/lib/auth.ts: roles and permissions
- prisma/schema.prisma: database schema
- next.config.ts: images, caching, security headers
- public/ghyar-market-logo.png: current supplied logo

## Roles and rules

Buyer:
- Browse, favorite stores, buy parts, message sellers, and review/order actions.

Shop owner:
- Can sell their own parts.
- Can buy parts from other sellers.
- Must not buy their own listed parts.
- Can favorite stores.

Admin:
- Manages users, stores, parts, reports, reviews, and orders.
- Must not see the heart/favorite control.

Favorites are stores, not parts.
The favorite page keeps an unfavorited store visible until the user leaves that page, then reloads the saved state.
The favorite area has no trash/delete button; the heart remains.

Delivery:
- Buyer sees the action named: تم استلام الطلب و الدفع
- Seller receives a notification with order details after buyer confirms delivery/payment.
- Notifications should route to the correct destination, such as relevant shop/comments/messages/order area.
- Notification-center close X was repositioned away from the bell.

Other completed behavior:
- Duplicate رسائل العملاء header button removed for normal users; shop dashboard access remains.
- سيارتي feature/button removed.
- Browser back/forward behavior was addressed.
- Dates changed from Hijri to Gregorian where requested.
- Resend email notifications were configured for verified domain ghyarmarket-eg.com and Vercel variables.

Decisions to revisit before a major remake:
- Payment method
- Delivery process
- Return/refund policy
- Store verification
- Whether every part needs admin approval
- Strict or optional compatibility data

## Images

The upload API:
- Accepts common image types.
- Has a 4 MB upload limit.
- Rotates images.
- Resizes without enlargement up to 2048px.
- Converts to WebP at quality 92.
This was improved from 1280px and quality 78 because shop photos looked blurry.
Existing old shop photos were already compressed, so re-uploading them once may be needed.

Current card image design:
1. Wide shop photo banner at the top.
2. Store name overlaid on the banner.
3. Clicking the banner opens the seller store.
4. Part photo below the banner.
5. Offer information below the part photo.
6. Card ends at عرض التفاصيل.
7. No seller/photo section below the details button.
Implemented in:
- src/components/views/parts-view.tsx
- src/components/views/home-view.tsx

## Completed UI work

- Professional Arabic RTL marketplace redesign.
- Responsive desktop, mobile portrait, and mobile landscape layouts.
- Admin/shop dashboard alignment and mobile tab fixes.
- Sheet/menu close X positioning fixes.
- Smaller, clearer homepage hero:
  قطع غيار موثوقة، في مكان واحد
  اطلبها بسهولة من متاجر موثوقة
- Better store image display and upload quality.
- Current supplied logo used in header, footer, auth, favicon, and Apple icon.
- Logo backgrounds adjusted for light and dark mode.

## Recent production commits

- 3a1c887 Refresh brand logo for light and dark themes
- 480c00f Move shop banner above product photo
- 444c955 Improve store image quality across marketplace
- 33282ed Improve shop image upload and display quality
- 81cf8f6 Compact seller card and link shop photo
- a6a23d5 Separate offer and seller details on part cards
- a4e792c Improve shop photo and offer card details
- 25425f5 Move shop photo into product card details
- 53f05f7 Refine homepage hero messaging
- 0e1300f Keep unfavorited stores visible in wishlist session
- 88ba10f Fix mobile sheet close button placement
- 1030770 Fix mobile dashboard tab overlap
- 38adf4d Fix portrait dashboard layouts
- e07bec8 Add new brand logo
- e2276be Full UI redesign

## Verification checklist

For every change:
- Check buyer/shop-owner/admin visibility.
- Check Arabic RTL.
- Check desktop, mobile portrait, and mobile landscape.
- Check light and dark mode.
- Check loading, empty, error, and signed-out states.
- Check nested button event propagation.
- Check notification destinations.
- Check image sizes and quality.
- Run lint and build.
- Push only after checks pass.
- Never claim deployment unless push succeeds.

