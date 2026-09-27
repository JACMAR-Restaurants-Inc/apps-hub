# JM Portal: parity with the Apps Script portal

The owner's call, 2026-09-25: finish the whole portal before Cash Balancing. This is the
checklist, taken from RBAC/CLAUDE.md §44–§85 and the portal's code (inventory made
2026-09-25). Tick an item only when it has been seen working in a browser. Items still open
were built but not yet seen (the door signed out, a manager's view, saving in the
panel), or are not built. The §
numbers are RBAC/CLAUDE.md's; read the section before building the item.

Four pull requests, in this order. The owner decides what is out of scope; nothing
here is dropped silently.

## A. Look and shell

- [x] Light only; dark mode removed until someone designs one (§44)
- [x] Tokens from Ui.html, not palettes.md, which is stale: page #F3F6FB, card #FFF,
      primary #1668E3, text #25344B / #4F5D70 / #627081, border #E4EAF2, status
      red #B42D46 / green #1E7A58 / orange #A4521C, and the soft fills. Every text pair
      at least 4.5:1, checked by a test
- [x] Inter 400–700, base 14px, minimum 12px; every input and select at least 16px, so
      iOS does not zoom (§60)
- [x] Gutter 16 / 24 from 761px / 32 from 1600px; no maximum page width
- [x] The JM Portal mark (the door with a keyhole): "JM" in navy, "Portal" in #1668E3,
      never translated
- [x] Top bar, 60px, sticky, white, with these parts:
  - [x] the mark on the left, which goes home and refreshes (§56)
  - [x] the menu, behind ≡ below 761px. It was admins only (Home, Access directory
        with a waiting badge that hides at 0); since the redesign (2026-09-26, below)
        everybody has one
  - [x] the account button (initials and role label), whose card shows the address,
        "Signed in with Google", Language FR | EN, and Sign out
- [x] Footer: "Jacmar Restaurants Inc. · les accès sont gérés par le bureau"
- [ ] Sign-in door (§40/§44/§54):
  - [ ] on a laptop, a navy panel with the pitch and three points, beside a light pane
        with the language pill, Arches with the lockup, the Google button, "no Google
        account" and the footer line
  - [ ] on a phone, one navy screen
- [ ] Error view for a cancelled or expired sign-in, with Try again
- [ ] Add to home screen: a manifest (standalone, #0B2556 / #F3F6FB, fr-CA) and the
      four icons. No button, no service worker (§69)
- [x] Language: French by default, first seeded from the browser, remembered

## B. Catalogue and home

- [x] All 18 apps from PORTAL_APPS, with names exactly as each app gives them (§28/§83),
      bilingual blurbs, groups, categories, and one of three visibilities: governed,
      admin only, or open to all
- [x] Card marks: our own logos (Cash Balancing, Project Management); the Arches only on
      @mcd and the Guides (§74); the GitHub mark; everyone else gets letters in their
      own colour
- [x] Labels: "Ouvrir l'application" for real apps, "Ouvrir ↗" for links, and "Pas
      encore relié" when an app has no URL. Other companies' sites and newTab apps open
      in a new tab with noopener (§76/§77/§82)
- [x] Each app's URL comes from configuration, not code, since some go stale (the
      Guides URL has the year in it)
- [x] ~~Groups "Mes applications" / "Autres outils", each with a count, a line of
      explanation and "Voir tout →" from 2 cards (§51/§55)~~ Replaced by the redesign
      below: one list
- [x] Order: held, then pending, then askable, alphabetical by French name (§82)
- [x] ~~Group pages, real URLs now, whose filter counts only that group (§57/§64)~~
      Replaced by one Applications page; `/apps/internal` and `/apps/external` redirect
      to `/apps`
- [x] Search from 3 apps: name, blurb and category in both languages, accents ignored,
      Escape clears (§47/§75)
- [x] One category dropdown, showing only the categories on the page, each with a
      count, and falling back to All (§61)
- [ ] "No app matches" with Clear
- [x] Greeting by name (§54):
  - [x] Bonjour / Bon après-midi / Bonsoir, in Toronto time, corrected by the device's
        clock
  - [x] the first name, title-cased only when stored in capitals, and a 👋
- [x] Summary cards (§44/§63):
  - [x] admin: Apps, Waiting for you (a figure only), People with access (opens the
        directory)
  - [ ] manager: Apps, Your restaurant(s), Your requests if one is pending
- [ ] "No apps yet" banner for a non-admin who holds nothing governed (§66/§72), with
      the address and a switch-account link
- [ ] Card states: held; pending with the date; revoked, which says "Your access was
      removed. You can ask again."
- [ ] Request form: "Demander au bureau l'accès à {app} ?", and a success line
- [ ] Audit "signed in with no grants" (§72)
- [x] Role label in the reader's language: Gérant, Bureau, Consultation (§67/§81)

## C. Access directory and Grant panel

- [x] Its own page (§62); "← Accueil" above 761px
- [x] Columns Name (initials), Sign-in address, Status, Role, Restaurants, and the
      action, on one shared column grid (§71). Cards on a phone (§59), where an
      ordinary role is bold plain text and a system admin shows its badge
- [x] Status pills: active, inactive, pending, revoked, declined (endedKey, §48)
- [x] Name or address filter, and a restaurants filter, working together
- [ ] "Updated N min ago"; refreshed every 60 s while visible and when the tab comes
      back, never while a panel is open, an older answer never overwriting a newer one
      (§48 @79)
- [x] Expanding a row shows: signs in with; what HR has on file, or "not recorded,
      an offboarding sweep will miss them"; added on and by; each app's row
- [x] "What can they actually do? →" runs explain() at every store
- [x] Grant panel as a right-hand drawer, at most 480px wide, containing:
  - [x] each role's help text
  - [x] restaurants in two columns, with Select all / Clear
  - [x] a note line that says why the button is disabled or what will happen, and
        "Nothing has changed yet"
- [ ] While saving:
  - [ ] the pressed button spins
  - [ ] "Still working…" after 6 s
  - [ ] the panel cannot be closed
  - [ ] a toast on success
  - [ ] every error code is put into words

## D. What used to be done in the spreadsheet

These had no screen in the old portal; now there is no spreadsheet.

- [x] Kill switch: switch a person off or back on, for every app (§30/§31)
- [x] Admins: add or remove, and turn `notify` on or off
- [x] Restaurants: open them, and add one. Closing is NOT offered (owner's call,
      2026-09-25): done on request, by script
- [x] App URLs (configuration, see B)
- [x] Reading the audit log
- Deferred by the owner, 2026-09-25 ("leave those for now"): editing the Perm_ matrix,
  and offboarding by HR email. Not built; raise again after Cash Balancing.

## Not rebuilt: Apps Script workarounds (§49–§57, §68, §78–§80)

Framed front doors, the frame's postMessage relay, the auth-redirect page, linking
cards through Google with login_hint, the one-URL "views", the loading screens for
cold starts, the roster cache warmer, the sheet edit triggers, token-expiry logic in
polling, data-URI favicons, the run_* editor wrappers.

## Beyond parity: the owner's redesign (2026-09-26)

Asked for after parity was reached, and a departure from the old portal on purpose.

- [x] Favoris replaces "Mes applications": a star on every card, the starred apps
      first on Home in the order starred. Stored per person (`portal.favourites`), so
      they follow them between devices. A star grants nothing; only an app the person
      may see can be starred, checked on the server. Deleting a person deletes their stars
- [x] Applications: every app in ONE list with the search and categories, on Home
      under Favoris and as its own page, `/apps`
- [x] A menu for everybody: Accueil · Applications · Demandes (badge: their own
      pending requests). Admins: Accueil · Applications · Répertoire des accès ·
      Administration
- [x] Demandes (`/requests`): the person's PENDING requests with the date asked, or
      "Aucune demande en attente". The "Vos demandes" summary card went with it

## Parked in the old portal too (§57, §59, §85)

Favourites (built since, above), the card "…" menu, a sort control, a Google Workspace card, role and status
filters in the directory. The fixed category list is waiting on a meeting with the
owner's boss and users (§81).
