# Paper Tail

**Paper Tail** is a browser-based territory-capture arcade game. Draw a tail outside your safe zone, close the loop, and claim every enclosed tile. Rival trails are dangerous: if one crosses your exposed tail, your run ends.

## Play locally

No build step or dependencies are required.

1. Clone the repository.
2. Open `index.html` in a modern browser, or serve the folder with any static web server.
3. Press **Start game**.
4. Move with **WASD** or the **arrow keys**. On touch screens, swipe on the board or use the on-screen directional pad.

## Controls

- **W / ↑**: move up
- **A / ←**: move left
- **S / ↓**: move down
- **D / →**: move right
- **Space / Escape**: pause or resume
- **Restart**: start a fresh run

## Gameplay

- Your starting patch is safe territory.
- Leaving your territory creates a vulnerable tail.
- Return to your territory to close the loop and capture enclosed tiles.
- Rival territory can be captured too when enclosed by your loop.
- Rival trails can cut your tail. Hitting the arena boundary or your own tail ends the run.
- Your best territory percentage is saved locally in your browser.

## Project files

- `index.html` — page structure and game HUD
- `styles.css` — responsive visual design
- `game.js` — canvas renderer, movement, territory flood-fill, rival AI, controls and local best score

## Deployment

This is a static site. Import the repository into Vercel (or another static hosting provider) and use the repository root as the project directory. No build command or output directory is required.
