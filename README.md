# Shifting Maze

A dynamic maze game where you navigate through an ever-shrinking labyrinth while collecting gems and avoiding enemies.

<img width="724" alt="Screenshot 2025-04-16 at 12 24 25 AM" src="https://github.com/user-attachments/assets/1e7ade9e-9bdd-450a-b028-52f25d36084c" />

## 🎮 Play the Game

You can play Shifting Maze by opening `index.html` in any modern web browser.

## 🔑 Game Controls

- **Move**: Arrow keys or WASD
- **Restart Level**: Press 'R' key
- **Toggle Sound**: Press 'M' key

## 🎯 Gameplay

### Objective
Collect as many gems as possible while navigating the maze. The maze walls gradually close in, adding pressure to your journey!

### Features
- **Dynamic Maze** that shrinks over time, adding strategy and urgency
- **Challenging Enemies** with unique behaviors:
  - Chasers (pink) - Actively pursue the player
  - Wanderers (purple) - Move randomly through the maze
- **Power-ups** to help your adventure:
  - Speed boost (green) - Move faster for a limited time
  - Invincibility (yellow) - Enemies can't hurt you temporarily
  - Ghost (blue) - Pass through walls for a short duration
- **Visual Effects** including particle systems and glow effects
- **Responsive Controls** with smooth movement

### Game Mechanics
1. The maze is procedurally generated using a randomized depth-first search algorithm
2. Outer walls close in periodically, creating a more challenging playspace
3. When all gems are collected, a new batch appears
4. Score increases with each gem collected
5. The game ends when an enemy catches you (unless invincible)

## 🚀 Technical Details

### Technologies Used
- Pure JavaScript (no external libraries)
- HTML5 Canvas for rendering
- Web Audio API for sound effects

### Code Structure
- **Maze Generation**: Randomized DFS algorithm with cycle creation for multiple paths
- **Enemy AI**: Two distinct behaviors with path decision logic
- **Particle System**: For visual effects and feedback
- **Power-up System**: Temporary player enhancements
- **Collision Detection**: For walls, gems, enemies, and power-ups

## 🧩 Game Elements

### Power-ups
| Type | Color | Effect |
|------|-------|--------|
| Speed | Green | 80% movement speed increase for 5 seconds |
| Invincibility | Yellow | Immunity from enemies for 3 seconds |
| Ghost | Blue | Pass through walls for 4 seconds |

### Enemies
| Type | Color | Behavior |
|------|-------|----------|
| Chaser | Pink | Actively tracks and pursues the player |
| Wanderer | Purple | Moves randomly through the maze |

## 🔧 Customization

You can modify game parameters by editing `script.js`:
- `CELL_SIZE`: Change the size of each maze cell
- `GRID_WIDTH` and `GRID_HEIGHT`: Adjust maze dimensions
- `FPS`: Change game frame rate
- `SHRINK_RATE`: Modify how quickly the maze shrinks
- `PLAYER_SPEED`: Adjust player movement speed
- `NUM_GEMS` and `NUM_ENEMIES`: Change the number of gems and enemies

## ✨ Credits

Created by Sunny Haladker: [LinkedIn](https://www.linkedin.com/in/sunnyhaladker/)
