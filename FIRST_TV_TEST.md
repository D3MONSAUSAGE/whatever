# First TV test

Do this once, on a real television, after [SETUP.md](SETUP.md). Use the production URL. A laptop on another network is a useful rehearsal, but it is not a substitute for the TV browser.

Confirm email should be off for this run, or you need to open the confirmation link before the dashboard will load.

## Before you start

- [ ] Migration `0001_init.sql` has been run.
- [ ] The four Vercel env vars are set and the app has been redeployed since the public ones were added.
- [ ] Supabase Site URL is the Vercel origin. `https://YOUR-APP.vercel.app/dashboard` is a redirect URL.
- [ ] You can sign in on your phone, on cellular, not on the TV's Wi-Fi.
- [ ] You have a JPG or PNG menu, ideally 1920×1080.

## Steps

1. On the phone, open the Vercel URL and create an account (or sign in).
2. Upload the menu under **Media**.
3. On the TV, open the web browser and go to `https://YOUR-APP.vercel.app/player`.
   A 6-digit code should fill the screen. If the browser asks about fullscreen, you can press a key or click later; the picture still fills the window without it.
4. On the phone, open **Displays**, type the code and a name ("Front counter" is fine), and connect.
   Within a few seconds the TV should leave the code and say **No content assigned**.
5. Choose the menu image. It should appear within about 15 seconds, letterboxed on black, with no blank flash.
6. Upload a second image and publish that one instead. Same 15-second window, and the first image should stay up until the second is ready.
7. Turn the TV's Wi-Fi off for about a minute. The picture should stay, with **Reconnecting...** along the bottom. Turn Wi-Fi on. The line should disappear, and a new publish should still arrive.
8. Delete the image that is on screen. The TV should say **No content assigned**.
9. Disconnect the display. The TV should show a new code. Enter the old code on the phone and confirm it is rejected.
10. Optional: sign out, create a second account, and confirm the media library is empty.

## Write down what the TV actually did

| | |
| --- | --- |
| Brand and model | |
| Year | |
| Browser (Tizen, webOS, Fire TV, other) | |
| `/player` loaded | |
| Code was readable | |
| Paired | |
| First image, and how long it took | |
| Second image, any blank frame | |
| Wi-Fi off: image stayed | |
| Wi-Fi on: caught up | |
| Disconnect returned to a code | |
| Fullscreen worked, or the window was already full | |
| After power off, did the page come back by itself? | |

Most TV browsers do not reopen a page after the set powers off. Someone has to open `/player` again. The TV stays paired, because the token is in `localStorage`. For a screen that must come back with nobody in the room, use a Fire TV Stick or an Android TV box with a kiosk browser that starts on boot.

Also check the set's own menu for screensaver, auto power off, and eco / energy saving. Those will dim or replace the page even when Pantalla is fine.

Very old sets (roughly before 2016) may reject the HTTPS certificate. If the browser shows a certificate error, that set cannot run the player. Use a streaming stick.

## If a step fails

Use [RECOVERY.md](RECOVERY.md). The useful split is:

- code never appears → the TV never reached the app
- code is rejected → expiry, a typo, or the rate limit
- code works, image never appears → publish, or the TV could not fetch the signed URL
- image appears, then sticks forever → the poll stopped (network, or the page was killed by the TV)
