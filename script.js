const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');

// --- Enhanced Neobrutalist Color Palette ---
const BG_COLOR = '#1a1a2e';      // Darker Blue-Gray
const WALL_COLOR = '#16213e';    // Deep Blue
const PLAYER_COLOR = '#0ead69';  // Bright Green (easier to see)
const GEM_COLOR = '#ff7700';     // Orange
const ENEMY_COLOR = '#e94560';    // Bright Pink-Red
const PATH_COLOR = '#1a1a2e';     // Path color same as background
const HIGHLIGHT_COLOR = '#4cc9f0'; // Cyan for highlights and effects

// --- Game Settings ---
const CELL_SIZE = 32; // Slightly larger cells
const GRID_WIDTH = 21; // Use odd numbers for better maze generation
const GRID_HEIGHT = 15; // Use odd numbers for better maze generation
canvas.width = GRID_WIDTH * CELL_SIZE;
canvas.height = GRID_HEIGHT * CELL_SIZE;
const FPS = 60; // Increased for smoother animation
const SHRINK_RATE = 8000; // Time in milliseconds between map shrinks (longer to give more play time)
const PLAYER_SPEED = CELL_SIZE / 6; // Faster movement for more dynamic gameplay
const WALL_THICKNESS = 5; // Thicker walls for better visibility
const GLOW_INTENSITY = 15; // Size of glow effect in pixels

// --- Sound Effects ---
let soundEnabled = true;
let audioCtx = null;
const sounds = {
    gemCollect: null,
    enemyHit: null,
    wallShift: null,
    gameStart: null,
    gameOver: null,
    powerUp: null
};

// Initialize sounds
function initSounds() {
    try {
        // Create AudioContext only on user interaction to comply with browser policies
        const createAudioContext = () => {
            if (audioCtx === null) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
            }
            return audioCtx;
        };
        
        // Create a reusable function for sound effects
        const createSound = (type, freq, duration, volume = 0.2) => {
            return () => {
                if (!soundEnabled) return;
                
                try {
                    const ctx = createAudioContext();
                    
                    const oscillator = ctx.createOscillator();
                    const gainNode = ctx.createGain();
                    
                    oscillator.type = type;
                    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
                    oscillator.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    
                    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
                    
                    oscillator.start();
                    oscillator.stop(ctx.currentTime + duration);
                } catch (e) {
                    console.log("Error playing sound:", e);
                }
            };
        };
        
        // Register sound functions
        sounds.gemCollect = createSound('triangle', 880, 0.1, 0.15);
        sounds.enemyHit = createSound('sawtooth', 150, 0.5, 0.3);
        sounds.wallShift = createSound('sine', 300, 0.3, 0.1);
        sounds.gameStart = createSound('square', 440, 0.2, 0.2);
        sounds.gameOver = createSound('sawtooth', 220, 1, 0.3);
        sounds.powerUp = createSound('sine', 660, 0.3, 0.2);
    } catch (e) {
        console.log("Audio couldn't be initialized:", e);
        soundEnabled = false;
    }
}

// --- Visual Effects ---
let particles = [];
let powerUps = [];
const POWERUP_TYPES = ['speed', 'invincibility', 'ghost'];

class Particle {
    constructor(x, y, color, size, speedX, speedY, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.initialSize = size;
        this.speedX = speedX;
        this.speedY = speedY;
        this.life = life; // In frames
        this.maxLife = life;
    }
    
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life--;
        this.size = this.initialSize * (this.life / this.maxLife);
        return this.life > 0;
    }
    
    draw() {
        ctx.globalAlpha = this.life / this.maxLife;
        drawCircle(this.x, this.y, this.size, this.color);
        ctx.globalAlpha = 1;
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.size = CELL_SIZE * 0.5;
        this.angle = 0;
        this.gridX = Math.floor(x / CELL_SIZE);
        this.gridY = Math.floor(y / CELL_SIZE);
    }
    
    update() {
        // Pulsating animation
        this.angle += 0.05;
        return true; // PowerUps don't expire with time
    }
    
    draw() {
        const pulseFactor = 0.2 * Math.sin(this.angle) + 1;
        let color;
        
        switch (this.type) {
            case 'speed':
                color = '#00ff00';
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - this.size/2 * pulseFactor);
                ctx.lineTo(this.x + this.size/2 * pulseFactor, this.y);
                ctx.lineTo(this.x, this.y + this.size/2 * pulseFactor);
                ctx.lineTo(this.x - this.size/2 * pulseFactor, this.y);
                ctx.closePath();
                ctx.fill();
                break;
                
            case 'invincibility':
                color = '#ffff00';
                drawCircle(this.x, this.y, this.size/2 * pulseFactor, color);
                break;
                
            case 'ghost':
                color = '#aaaaff';
                ctx.fillStyle = color;
                ctx.beginPath();
                const ghostSize = this.size/2 * pulseFactor;
                ctx.arc(this.x, this.y, ghostSize, Math.PI, 0, false);
                ctx.lineTo(this.x + ghostSize, this.y + ghostSize);
                ctx.lineTo(this.x + ghostSize/2, this.y + ghostSize/2);
                ctx.lineTo(this.x, this.y + ghostSize);
                ctx.lineTo(this.x - ghostSize/2, this.y + ghostSize/2);
                ctx.lineTo(this.x - ghostSize, this.y + ghostSize);
                ctx.closePath();
                ctx.fill();
                break;
        }
        
        // Add glow effect
        ctx.shadowBlur = GLOW_INTENSITY;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- Game State ---
let score = 0;
let gameState = 'start'; // 'start', 'playing', 'gameOver'
let lastShrinkTime = 0;
let currentGridBounds = {
    minX: 0,
    maxX: GRID_WIDTH - 1,
    minY: 0,
    maxY: GRID_HEIGHT - 1
};

// --- Maze Grid (0: path, 1: wall) ---
let grid = []; // Initialize grid in the generation function

// --- Maze Generation (Randomized DFS with cycles) ---
function initializeMaze() {
    grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(1)); // Start with all walls
    const stack = [];
    const startX = 1, startY = 1; // Start carving from (1,1)

    grid[startY][startX] = 0; // Mark start as path
    stack.push([startX, startY]);

    while (stack.length > 0) {
        const [cx, cy] = stack[stack.length - 1]; // Get current cell from top of stack

        // Find unvisited neighbors (2 cells away)
        const neighbors = [];
        const directions = [[0, -2], [0, 2], [-2, 0], [2, 0]]; // N, S, W, E (2 steps)
        directions.sort(() => Math.random() - 0.5); // Shuffle directions

        for (const [dx, dy] of directions) {
            const nx = cx + dx;
            const ny = cy + dy;

            // Check bounds and if neighbor is a wall (unvisited)
            if (nx > 0 && nx < GRID_WIDTH - 1 && ny > 0 && ny < GRID_HEIGHT - 1 && grid[ny][nx] === 1) {
                neighbors.push([nx, ny, dx, dy]); // Store neighbor coords and direction delta
            }
        }

        if (neighbors.length > 0) {
            // Choose a random neighbor
            const [nx, ny, dx, dy] = neighbors[0]; // Pick the first shuffled neighbor

            // Carve path to neighbor:
            // 1. Mark neighbor as path
            grid[ny][nx] = 0;
            // 2. Mark cell between current and neighbor as path
            grid[cy + dy / 2][cx + dx / 2] = 0;

            // Push neighbor onto stack
            stack.push([nx, ny]);
        } else {
            // No unvisited neighbors, backtrack
            stack.pop();
        }
    }

    // Add significantly more loops/cycles to make the maze more complex with multiple paths
    // This gives the player more options to evade enemies
    const numCycles = Math.floor(Math.min(GRID_WIDTH, GRID_HEIGHT) * 1.5); // Increased number of cycles
    for (let i = 0; i < numCycles; i++) {
        // Pick a random wall
        const x = Math.floor(Math.random() * (GRID_WIDTH-2)) + 1;
        const y = Math.floor(Math.random() * (GRID_HEIGHT-2)) + 1;
        
        // Only remove non-border walls that have path on both sides
        if (grid[y][x] === 1) {
            // Check if removing this wall would create a cycle (both sides are already path)
            const hasPathNeighbors = [
                [y, x-1],
                [y, x+1],
                [y-1, x],
                [y+1, x]
            ].filter(([ny, nx]) => grid[ny] && grid[ny][nx] === 0).length >= 2;
            
            if (hasPathNeighbors) {
                grid[y][x] = 0; // Remove wall to create a cycle
                
                // Occasionally create small open areas (2x2 or 3x2)
                // This creates escape routes and ambush opportunities
                if (Math.random() < 0.3 && x < GRID_WIDTH - 2 && y < GRID_HEIGHT - 2) {
                    const areaWidth = Math.random() < 0.5 ? 2 : 3;
                    const areaHeight = 2;
                    
                    // Only create an open area if it doesn't break the border
                    if (x + areaWidth < GRID_WIDTH - 1 && y + areaHeight < GRID_HEIGHT - 1) {
                        // Make sure we're not clearing the very edge of the map
                        for (let ny = y; ny < y + areaHeight; ny++) {
                            for (let nx = x; nx < x + areaWidth; nx++) {
                                if (nx > 0 && nx < GRID_WIDTH - 1 && ny > 0 && ny < GRID_HEIGHT - 1) {
                                    grid[ny][nx] = 0; // Create open space
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Ensure player start position is clear and create a small safe area around start
    grid[1][1] = 0;
    grid[1][2] = 0;
    grid[2][1] = 0;
    grid[2][2] = 0;

    // Reset shrink bounds
    currentGridBounds = {
        minX: 0,
        maxX: GRID_WIDTH - 1,
        minY: 0,
        maxY: GRID_HEIGHT - 1
    };
    shrinkingWalls = []; // Clear shrinking walls list
}

// --- Player ---
const player = {
    x: CELL_SIZE * 1.5, // Center of cell (1, 1)
    y: CELL_SIZE * 1.5,
    vx: 0, // Current velocity x
    vy: 0, // Current velocity y
    targetVx: 0, // Desired velocity x (from input)
    targetVy: 0, // Desired velocity y (from input)
    size: CELL_SIZE * 0.6,
    trail: [], // Array to store previous positions for trail effect
    maxTrail: 5, // Number of trail segments to display
    powerUps: {
        speed: 0,       // Timer for speed boost (frames)
        invincibility: 0, // Timer for invincibility (frames)
        ghost: 0        // Timer for passing through walls (frames)
    },
    baseSpeed: PLAYER_SPEED,
    angle: 0 // For rotation animation
};

// --- Gems ---
let gems = [];
const NUM_GEMS = 20; // Example number

function placeGems() {
    gems = [];
    let placed = 0;
    const maxAttempts = NUM_GEMS * 10;
    let attempts = 0;
    
    // Count available cells
    const { minX, maxX, minY, maxY } = currentGridBounds;
    let availableSpaces = 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (grid[y] && grid[y][x] === 0) availableSpaces++;
        }
    }
    
    // Adjust number of gems based on available space
    const targetGems = Math.min(NUM_GEMS, Math.floor(availableSpaces / 3));
    
    while (placed < targetGems && attempts < maxAttempts) {
        const gridX = Math.floor(Math.random() * GRID_WIDTH);
        const gridY = Math.floor(Math.random() * GRID_HEIGHT);
        attempts++;
        // Ensure placement is on a path and not the starting cell
        if (grid[gridY] && grid[gridY][gridX] === 0 && !(gridX === 1 && gridY === 1)) {
            let exists = gems.some(gem => gem.gridX === gridX && gem.gridY === gridY);
            if (!exists) {
                gems.push({
                    x: gridX * CELL_SIZE + CELL_SIZE / 2,
                    y: gridY * CELL_SIZE + CELL_SIZE / 2,
                    gridX: gridX,
                    gridY: gridY,
                    size: CELL_SIZE * 0.4, // Slightly larger
                    angle: Math.random() * Math.PI * 2 // Random starting angle for rotation
                });
                placed++;
            }
        }
    }
    
    // If no gems could be placed at all and player is still alive, 
    // it means maze is too small - trigger victory
    if (placed === 0 && gameState === 'playing') {
        showVictoryMessage();
        setTimeout(() => {
            startGame();
        }, 3000);
    }
}

function placePowerUps() {
    powerUps = [];
    // Place fewer power-ups than gems
    const numPowerUps = Math.floor(NUM_GEMS / 5);
    
    for (let i = 0; i < numPowerUps; i++) {
        const gridX = Math.floor(Math.random() * GRID_WIDTH);
        const gridY = Math.floor(Math.random() * GRID_HEIGHT);
        
        // Ensure placement is on a path and not the starting cell
        if (grid[gridY] && grid[gridY][gridX] === 0 && !(gridX === 1 && gridY === 1)) {
            let exists = powerUps.some(p => p.gridX === gridX && p.gridY === gridY);
            let existsGem = gems.some(g => g.gridX === gridX && g.gridY === gridY);
            
            if (!exists && !existsGem) {
                const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
                powerUps.push(new PowerUp(
                    gridX * CELL_SIZE + CELL_SIZE / 2,
                    gridY * CELL_SIZE + CELL_SIZE / 2,
                    type
                ));
            }
        }
    }
}

// --- Enemies ---
let enemies = [];
const NUM_ENEMIES = 5; // Slightly increased for better variety
const ENEMY_TYPES = {
    CHASER: 'chaser',
    WANDERER: 'wanderer'
};
// Different colors for the two enemy types
const CHASER_COLOR = '#e94560';   // Original enemy color - bright pink-red for chasers
const WANDERER_COLOR = '#9d4edd'; // Purple color for wanderers

function placeEnemies() {
    enemies = [];
    const numChasers = Math.floor(NUM_ENEMIES / 2); // About half will be chasers
    const numWanderers = NUM_ENEMIES - numChasers;
    let placed = 0;
    const maxAttempts = NUM_ENEMIES * 10;
    let attempts = 0;
    
    // Place chasers first
    while (placed < numChasers && attempts < maxAttempts) {
        const gridX = Math.floor(Math.random() * GRID_WIDTH);
        const gridY = Math.floor(Math.random() * GRID_HEIGHT);
        attempts++;
        // Ensure placement is on a path and not too close to the start
        if (grid[gridY] && grid[gridY][gridX] === 0 && (Math.abs(gridX - 1) > 4 || Math.abs(gridY - 1) > 4)) {
            let exists = enemies.some(enemy => enemy.gridX === gridX && enemy.gridY === gridY);
            if (!exists) {
                enemies.push({
                    x: gridX * CELL_SIZE + CELL_SIZE / 2,
                    y: gridY * CELL_SIZE + CELL_SIZE / 2,
                    gridX: gridX,
                    gridY: gridY,
                    size: CELL_SIZE * 0.7,
                    vx: 0, // Start stationary
                    vy: 0,
                    moveCooldown: 0, // Timer for changing direction
                    type: ENEMY_TYPES.CHASER,
                    color: CHASER_COLOR,
                    eyes: {  // Eye details for animation
                        angle: 0,
                        blinkTimer: Math.random() * 100
                    }
                });
                placed++;
            }
        }
    }
    
    // Then place wanderers
    placed = 0;
    attempts = 0;
    while (placed < numWanderers && attempts < maxAttempts) {
        const gridX = Math.floor(Math.random() * GRID_WIDTH);
        const gridY = Math.floor(Math.random() * GRID_HEIGHT);
        attempts++;
        // Wanderers can be placed a bit closer to start since they don't chase aggressively
        if (grid[gridY] && grid[gridY][gridX] === 0 && (Math.abs(gridX - 1) > 3 || Math.abs(gridY - 1) > 3)) {
            let exists = enemies.some(enemy => enemy.gridX === gridX && enemy.gridY === gridY);
            if (!exists) {
                enemies.push({
                    x: gridX * CELL_SIZE + CELL_SIZE / 2,
                    y: gridY * CELL_SIZE + CELL_SIZE / 2,
                    gridX: gridX,
                    gridY: gridY,
                    size: CELL_SIZE * 0.65, // Slightly smaller than chasers
                    vx: 0,
                    vy: 0,
                    moveCooldown: 0,
                    type: ENEMY_TYPES.WANDERER,
                    color: WANDERER_COLOR,
                    directionTimer: 0,
                    eyes: {
                        angle: 0,
                        blinkTimer: Math.random() * 100
                    }
                });
                placed++;
            }
        }
    }
}

function createParticles(x, y, color, amount = 10) {
    for (let i = 0; i < amount; i++) {
        const speed = 0.5 + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        const size = 2 + Math.random() * 3;
        const life = 20 + Math.random() * 20;
        
        particles.push(new Particle(
            x, y, color, size,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            life
        ));
    }
}

// --- Update Functions ---
function updatePlayer() {
    handleInput();

    // Update player speed based on power-ups
    let currentSpeed = player.baseSpeed;
    if (player.powerUps.speed > 0) {
        currentSpeed *= 1.8; // 80% speed boost
        player.powerUps.speed--;
    }

    // Update trail
    if (player.vx !== 0 || player.vy !== 0) {
        player.trail.push({x: player.x, y: player.y});
        if (player.trail.length > player.maxTrail) {
            player.trail.shift();
        }
    }

    const currentGridX = Math.floor(player.x / CELL_SIZE);
    const currentGridY = Math.floor(player.y / CELL_SIZE);
    const PADDING = 1; // Small padding to prevent getting stuck on corners
    const playerHalfSize = player.size / 2 - PADDING;

    // --- Smooth Movement & Collision ---
    let nextX = player.x + player.targetVx * currentSpeed;
    let nextY = player.y + player.targetVy * currentSpeed;

    // Check potential collision points based on target velocity
    let collisionX = false;
    let collisionY = false;

    // Skip collision if ghost power-up is active
    if (player.powerUps.ghost <= 0) {
        // Check X-direction collision
        if (player.targetVx !== 0) {
            const checkPixelX = player.targetVx > 0 ? nextX + playerHalfSize : nextX - playerHalfSize;
            // Check collision at top and bottom edges in the direction of movement
            if (getGridValueAt(checkPixelX, player.y - playerHalfSize) === 1 ||
                getGridValueAt(checkPixelX, player.y + playerHalfSize) === 1) {
                collisionX = true;
                // Snap to wall edge
                player.x = player.targetVx > 0
                    ? (currentGridX + 1) * CELL_SIZE - playerHalfSize - PADDING
                    : currentGridX * CELL_SIZE + playerHalfSize + PADDING;
            }
        }

        // Check Y-direction collision
        if (player.targetVy !== 0) {
            const checkPixelY = player.targetVy > 0 ? nextY + playerHalfSize : nextY - playerHalfSize;
            // Check collision at left and right edges in the direction of movement
            if (getGridValueAt(player.x - playerHalfSize, checkPixelY) === 1 ||
                getGridValueAt(player.x + playerHalfSize, checkPixelY) === 1) {
                collisionY = true;
                // Snap to wall edge
                player.y = player.targetVy > 0
                    ? (currentGridY + 1) * CELL_SIZE - playerHalfSize - PADDING
                    : currentGridY * CELL_SIZE + playerHalfSize + PADDING;
            }
        }
    }

    // Apply movement if no collision in that direction
    if (!collisionX) {
        player.x = nextX;
    }
    if (!collisionY) {
        player.y = nextY;
    }

    // Update actual velocity for potential future use (e.g., animation)
    player.vx = collisionX ? 0 : player.targetVx;
    player.vy = collisionY ? 0 : player.targetVy;

    // Keep player within canvas bounds (important if outer walls shrink away)
    player.x = Math.max(player.size / 2, Math.min(canvas.width - player.size / 2, player.x));
    player.y = Math.max(player.size / 2, Math.min(canvas.height - player.size / 2, player.y));

    // Rotate player based on movement direction
    if (player.vx !== 0 || player.vy !== 0) {
        player.angle = Math.atan2(player.vy, player.vx);
    }

    checkGemCollision();
    checkPowerUpCollision();
    
    // Only check enemy collision if not invincible
    if (player.powerUps.invincibility <= 0 && checkEnemyCollision()) {
        gameState = 'gameOver';
        if (sounds.enemyHit) sounds.enemyHit();
        createParticles(player.x, player.y, PLAYER_COLOR, 20);
    }

    // Decrement power-up timers
    for (const power in player.powerUps) {
        if (player.powerUps[power] > 0) {
            player.powerUps[power]--;
            if (player.powerUps[power] === 0) {
                // Visual effect when power-up ends
                createParticles(player.x, player.y, HIGHLIGHT_COLOR, 10);
            }
        }
    }
}

function checkPowerUpCollision() {
    const playerRadius = player.size / 2;
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i];
        const dx = player.x - powerUp.x;
        const dy = player.y - powerUp.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < playerRadius + powerUp.size/2) {
            // Apply power-up effect
            switch (powerUp.type) {
                case 'speed':
                    player.powerUps.speed = FPS * 5; // 5 seconds boost
                    break;
                case 'invincibility':
                    player.powerUps.invincibility = FPS * 3; // 3 seconds invincibility
                    break;
                case 'ghost':
                    player.powerUps.ghost = FPS * 4; // 4 seconds ghost mode
                    break;
            }
            
            // Remove powerUp and create particles
            powerUps.splice(i, 1);
            createParticles(player.x, player.y, HIGHLIGHT_COLOR, 15);
            if (sounds.powerUp) sounds.powerUp();
        }
    }
}

function checkGemCollision() {
    const playerRadius = player.size / 2;
    for (let i = gems.length - 1; i >= 0; i--) {
        const gem = gems[i];
        const gemRadius = gem.size / 2;
        const dx = player.x - gem.x;
        const dy = player.y - gem.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < playerRadius + gemRadius) {
            gems.splice(i, 1); // Remove gem
            score++;
            scoreDisplay.textContent = `Score: ${score}`;
            // Create particles and play sound
            createParticles(gem.x, gem.y, GEM_COLOR, 10);
            if (sounds.gemCollect) sounds.gemCollect();
        }
    }
}

// --- Draw Functions ---
function drawRect(x, y, width, height, color, withGlow = false) {
    ctx.fillStyle = color;
    if (withGlow) {
        ctx.shadowBlur = GLOW_INTENSITY;
        ctx.shadowColor = color;
    }
    ctx.fillRect(x, y, width, height);
    if (withGlow) {
        ctx.shadowBlur = 0;
    }
}

function drawCircle(x, y, radius, color, withGlow = false) {
    ctx.fillStyle = color;
    if (withGlow) {
        ctx.shadowBlur = GLOW_INTENSITY;
        ctx.shadowColor = color;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (withGlow) {
        ctx.shadowBlur = 0;
    }
}

function drawMaze() {
    // Draw background
    drawRect(0, 0, canvas.width, canvas.height, PATH_COLOR);
    
    // Draw walls
    ctx.fillStyle = WALL_COLOR;
    
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (grid[y][x] === 1) {
                // Draw wall cells with subtle glow
                drawRect(
                    x * CELL_SIZE, 
                    y * CELL_SIZE, 
                    CELL_SIZE, 
                    CELL_SIZE, 
                    WALL_COLOR, 
                    true
                );
            }
        }
    }

    // Draw shrinking walls warning with animation effect
    shrinkingWalls.forEach(wall => {
        // Pulsating warning effect
        const pulseSpeed = 0.03;
        const pulseAmount = 0.5;
        const alpha = 0.3 + Math.sin(Date.now() * pulseSpeed) * pulseAmount;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = GLOW_INTENSITY * 1.5;
        ctx.shadowColor = ENEMY_COLOR;
        ctx.fillStyle = ENEMY_COLOR;
        ctx.fillRect(wall.x * CELL_SIZE, wall.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    });

    // Check if player is stuck - if the player is surrounded by walls on all sides
    if (gameState === 'playing') {
        const playerGridX = Math.floor(player.x / CELL_SIZE);
        const playerGridY = Math.floor(player.y / CELL_SIZE);
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // Up, Down, Left, Right
        
        let exit = false;
        for (const [dx, dy] of directions) {
            const nx = playerGridX + dx;
            const ny = playerGridY + dy;
            if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT && grid[ny][nx] === 0) {
                exit = true;
                break;
            }
        }
        
        if (!exit) {
            // Player is trapped - show quick restart button
            drawQuickRestartPrompt();
        }
    }
}

// Add a quick restart prompt when player is trapped
function drawQuickRestartPrompt() {
    // Display prompt in the center of the screen
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(canvas.width/2 - 100, canvas.height/2 - 40, 200, 80);
    ctx.strokeStyle = HIGHLIGHT_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width/2 - 100, canvas.height/2 - 40, 200, 80);
    
    // Pulsating text
    const pulseAmount = Math.sin(Date.now() * 0.006) * 0.2 + 0.8;
    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.shadowBlur = GLOW_INTENSITY;
    ctx.shadowColor = HIGHLIGHT_COLOR;
    ctx.font = `${18 * pulseAmount}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText("Trapped! Press 'R'", canvas.width/2, canvas.height/2);
    ctx.shadowBlur = 0;
    
    // Add hint below
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText("to restart level", canvas.width/2, canvas.height/2 + 20);
}

function drawPlayer() {
    // Draw trail first (oldest to newest)
    for (let i = 0; i < player.trail.length; i++) {
        const alpha = (i / player.trail.length) * 0.5;
        const size = player.size * 0.5 * (i / player.trail.length);
        ctx.globalAlpha = alpha;
        // Different trail color based on active power-ups
        let trailColor = PLAYER_COLOR;
        if (player.powerUps.speed > 0) trailColor = '#00ff00';
        if (player.powerUps.invincibility > 0) trailColor = '#ffff00';
        if (player.powerUps.ghost > 0) trailColor = '#aaaaff';
        drawCircle(player.trail[i].x, player.trail[i].y, size, trailColor);
    }
    ctx.globalAlpha = 1.0;

    // Special visual effects based on power-ups
    if (player.powerUps.invincibility > 0) {
        // Draw shield effect
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size/2 + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
    
    if (player.powerUps.ghost > 0) {
        // Semi-transparent player
        ctx.globalAlpha = 0.6;
    }

    // Draw player with glow effect
    if (player.vx !== 0 || player.vy !== 0) {
        // Player is moving - draw direction indicator
        const headSize = player.size * 0.6;
        const bodySize = player.size * 0.8;
        
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);
        
        // Draw body
        ctx.shadowBlur = GLOW_INTENSITY;
        ctx.shadowColor = PLAYER_COLOR;
        ctx.fillStyle = PLAYER_COLOR;
        ctx.beginPath();
        ctx.arc(0, 0, bodySize/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw direction indicator (front part)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(headSize/3, 0, headSize/3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.restore();
    } else {
        // Player is stationary - simple circle
        drawCircle(player.x, player.y, player.size/2, PLAYER_COLOR, true);
    }
    
    // Reset alpha
    ctx.globalAlpha = 1.0;
}

function drawGems() {
    gems.forEach(gem => {
        // Rotating gems with glow
        ctx.save();
        ctx.translate(gem.x, gem.y);
        gem.angle += 0.02; // Rotate gems
        ctx.rotate(gem.angle);
        
        // Diamond shape
        ctx.shadowBlur = GLOW_INTENSITY;
        ctx.shadowColor = GEM_COLOR;
        ctx.fillStyle = GEM_COLOR;
        ctx.beginPath();
        const size = gem.size;
        ctx.moveTo(0, -size/2);  // Top
        ctx.lineTo(size/2, 0);   // Right
        ctx.lineTo(0, size/2);   // Bottom
        ctx.lineTo(-size/2, 0);  // Left
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.restore();
    });
}

function drawEnemies() {
    enemies.forEach(enemy => {
        // Determine if player has invincibility
        const playerInvincible = player.powerUps.invincibility > 0;
        
        // Draw enemy glow effect
        ctx.shadowBlur = playerInvincible ? 0 : GLOW_INTENSITY; 
        ctx.shadowColor = enemy.color;
        
        // Enemy appearance changes when player is invincible
        if (playerInvincible) {
            ctx.fillStyle = '#6666aa'; // Frightened color
            ctx.globalAlpha = 0.7;
        } else {
            ctx.fillStyle = enemy.color;
        }
        
        // Determine direction of movement
        const angle = enemy.vx !== 0 || enemy.vy !== 0 
            ? Math.atan2(enemy.vy, enemy.vx) 
            : 0;
        
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(angle);
        
        const radius = enemy.size / 2;
        
        if (enemy.type === ENEMY_TYPES.CHASER) {
            // CHASER - triangular top shape
            ctx.beginPath();
            ctx.arc(0, -radius/5, radius, Math.PI * 0.8, Math.PI * 0.2, true);
            
            // Add jagged bottom for aggressive appearance
            const tentacleWidth = radius / 3;
            ctx.lineTo(radius, radius);
            ctx.lineTo(radius - tentacleWidth, radius/2);
            ctx.lineTo(radius - 2*tentacleWidth, radius);
            ctx.lineTo(radius - 3*tentacleWidth, radius/2);
            ctx.lineTo(-radius + 3*tentacleWidth, radius/2);
            ctx.lineTo(-radius + 2*tentacleWidth, radius);
            ctx.lineTo(-radius + tentacleWidth, radius/2);
            ctx.lineTo(-radius, radius);
            ctx.closePath();
            ctx.fill();
            
        } else { // WANDERER
            // More rounded top shape
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Add small antennas to wanderers
            ctx.strokeStyle = enemy.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-radius/2, -radius/2);
            ctx.lineTo(-radius/2, -radius);
            ctx.moveTo(radius/2, -radius/2);
            ctx.lineTo(radius/2, -radius);
            ctx.stroke();
        }
        
        // Eye whites - common to both types
        ctx.fillStyle = "#ffffff";
        const eyeRadius = radius / 3;
        const blinking = enemy.eyes.blinkTimer < 5; // Blink occasionally
        
        if (!blinking) {
            ctx.beginPath();
            ctx.arc(-radius/3, -radius/5, eyeRadius, 0, Math.PI * 2);
            ctx.arc(radius/3, -radius/5, eyeRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Eye pupils look toward player
            const pupilOffset = eyeRadius * 0.4;
            ctx.fillStyle = playerInvincible ? "#6666aa" : "#000000";
            const pupilRadius = eyeRadius / 2;
            
            // Adjust pupil position to look toward player
            const eyeAngle = enemy.eyes.angle - angle; // Adjust for enemy rotation
            const pupilX = Math.cos(eyeAngle) * pupilOffset;
            const pupilY = Math.sin(eyeAngle) * pupilOffset;
            
            ctx.beginPath();
            ctx.arc(-radius/3 + pupilX, -radius/5 + pupilY, pupilRadius, 0, Math.PI * 2);
            ctx.arc(radius/3 + pupilX, -radius/5 + pupilY, pupilRadius, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Draw closed eyes (blinking)
            ctx.strokeStyle = playerInvincible ? "#6666aa" : "#000000";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-radius/3 - eyeRadius/2, -radius/5);
            ctx.lineTo(-radius/3 + eyeRadius/2, -radius/5);
            ctx.moveTo(radius/3 - eyeRadius/2, -radius/5);
            ctx.lineTo(radius/3 + eyeRadius/2, -radius/5);
            ctx.stroke();
        }
        
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    });
}

function drawParticles() {
    // Update and draw particles
    particles = particles.filter(p => {
        const isAlive = p.update();
        if (isAlive) p.draw();
        return isAlive;
    });
}

function drawPowerUps() {
    powerUps.forEach(powerUp => {
        powerUp.update();
        powerUp.draw();
    });
}

function drawActiveEffects() {
    // Draw UI indicators for active power-ups
    const indicatorSize = 25;
    const margin = 10;
    let offsetY = CELL_SIZE * 0.5;
    
    if (player.powerUps.speed > 0) {
        ctx.fillStyle = '#00ff00';
        const timeLeft = player.powerUps.speed / FPS;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(margin, offsetY, indicatorSize, indicatorSize);
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(margin, offsetY, indicatorSize, indicatorSize);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.fillText(Math.ceil(timeLeft), margin + indicatorSize/2 - 4, offsetY + indicatorSize/2 + 4);
        offsetY += indicatorSize + margin;
    }
    
    if (player.powerUps.invincibility > 0) {
        ctx.fillStyle = '#ffff00';
        const timeLeft = player.powerUps.invincibility / FPS;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(margin, offsetY, indicatorSize, indicatorSize);
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(margin, offsetY, indicatorSize, indicatorSize);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.fillText(Math.ceil(timeLeft), margin + indicatorSize/2 - 4, offsetY + indicatorSize/2 + 4);
        offsetY += indicatorSize + margin;
    }
    
    if (player.powerUps.ghost > 0) {
        ctx.fillStyle = '#aaaaff';
        const timeLeft = player.powerUps.ghost / FPS;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(margin, offsetY, indicatorSize, indicatorSize);
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(margin, offsetY, indicatorSize, indicatorSize);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.fillText(Math.ceil(timeLeft), margin + indicatorSize/2 - 4, offsetY + indicatorSize/2 + 4);
    }
}

function drawStartScreen() {
    drawRect(0, 0, canvas.width, canvas.height, BG_COLOR);
    
    // Title with glow effect
    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.shadowBlur = GLOW_INTENSITY * 2;
    ctx.shadowColor = HIGHLIGHT_COLOR;
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Shifting Maze', canvas.width / 2, canvas.height / 3);
    ctx.shadowBlur = 0;

    // Animated subtitle
    const pulseAmount = Math.sin(Date.now() * 0.003) * 0.2 + 0.8;
    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = `${20 * pulseAmount}px sans-serif`;
    ctx.fillText('Press any key to start', canvas.width / 2, canvas.height / 2);
    
    // Controls
    ctx.font = '16px sans-serif';
    ctx.fillStyle = GEM_COLOR;
    ctx.fillText('Use Arrow Keys or WASD to move', canvas.width / 2, canvas.height * 0.58);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText("Press 'R' to restart current level", canvas.width / 2, canvas.height * 0.63);
    
    // Power-up guide
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#00ff00';
    ctx.fillText('Speed', canvas.width / 2 - 60, canvas.height * 0.7);
    ctx.fillStyle = '#ffff00';
    ctx.fillText('Invincibility', canvas.width / 2, canvas.height * 0.7);
    ctx.fillStyle = '#aaaaff';
    ctx.fillText('Ghost', canvas.width / 2 + 60, canvas.height * 0.7);
    
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText('Made with love by Sunny: https://www.linkedin.com/in/sunnyhaladker/', canvas.width / 2, canvas.height * 0.9);
    
    // Draw some animated particles for visual interest
    if (Math.random() < 0.05) {
        createParticles(
            Math.random() * canvas.width, 
            Math.random() * canvas.height,
            [GEM_COLOR, PLAYER_COLOR, HIGHLIGHT_COLOR][Math.floor(Math.random() * 3)],
            3
        );
    }
    drawParticles();
}

function drawGameOverScreen() {
    // Semi-transparent overlay with cool effect
    const gradient = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 50,
        canvas.width/2, canvas.height/2, canvas.width/2
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Game Over text with glow
    ctx.fillStyle = ENEMY_COLOR;
    ctx.shadowBlur = GLOW_INTENSITY * 2;
    ctx.shadowColor = ENEMY_COLOR;
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 3);
    ctx.shadowBlur = 0;
    
    // Score with glow
    ctx.fillStyle = GEM_COLOR;
    ctx.shadowBlur = GLOW_INTENSITY;
    ctx.shadowColor = GEM_COLOR;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;
    
    // Restart prompt with animation
    const pulseAmount = Math.sin(Date.now() * 0.003) * 0.2 + 0.8;
    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.font = `${20 * pulseAmount}px sans-serif`;
    ctx.fillText('Press any key to restart', canvas.width / 2, canvas.height * 0.65);
    
    // Create occasional particles for visual interest
    if (Math.random() < 0.1) {
        createParticles(
            canvas.width/2 + (Math.random() - 0.5) * 100, 
            canvas.height/2 + (Math.random() - 0.5) * 100,
            [ENEMY_COLOR, GEM_COLOR][Math.floor(Math.random() * 2)],
            2
        );
    }
    drawParticles();
}

let shrinkingWalls = []; // Store walls that are about to shrink {x, y, timer}
const SHRINK_WARNING_TIME = 2000; // ms before wall solidifies - longer warning

function shrinkMaze(currentTime) {
    // Update existing shrinking walls
    for (let i = shrinkingWalls.length - 1; i >= 0; i--) {
        shrinkingWalls[i].timer -= 1000 / FPS; // Decrement timer
        if (shrinkingWalls[i].timer <= 0) {
            // Timer expired, solidify wall
            const { x, y } = shrinkingWalls[i];
            if (grid[y] && grid[y][x] === 0) { // Check if it's still a path
                grid[y][x] = 1; // Turn into wall
                createParticles(x * CELL_SIZE + CELL_SIZE/2, y * CELL_SIZE + CELL_SIZE/2, WALL_COLOR, 5);
            }
            shrinkingWalls.splice(i, 1); // Remove from shrinking list
        }
    }

    // Check if it's time to initiate a new shrink cycle
    if (currentTime - lastShrinkTime > SHRINK_RATE) {
        lastShrinkTime = currentTime;

        const { minX, maxX, minY, maxY } = currentGridBounds;

        // Check if shrinking is possible
        if (maxX - minX <= 7 || maxY - minY <= 7) { // Increased minimum size to prevent too small mazes
            // Maze is getting too small - check if player won
            if (gems.length === 0) {
                // Player collected all gems in small maze - win condition!
                showVictoryMessage();
                // After a delay, regenerate a new maze
                setTimeout(() => {
                    startGame();
                }, 3000); 
            }
            return; // Stop shrinking when very small
        }

        // Play sound effect
        if (sounds.wallShift) sounds.wallShift();

        // Identify walls to start shrinking (outer path layer)
        for (let y = minY; y <= maxY; y++) {
            if (grid[y]) {
                if (grid[y][minX] === 0) shrinkingWalls.push({ x: minX, y: y, timer: SHRINK_WARNING_TIME });
                if (grid[y][maxX] === 0 && minX !== maxX) shrinkingWalls.push({ x: maxX, y: y, timer: SHRINK_WARNING_TIME });
            }
        }
        for (let x = minX + 1; x < maxX; x++) { // Avoid double-adding corners
            if (grid[minY] && grid[minY][x] === 0) shrinkingWalls.push({ x: x, y: minY, timer: SHRINK_WARNING_TIME });
            if (grid[maxY] && grid[maxY][x] === 0 && minY !== maxY) shrinkingWalls.push({ x: x, y: maxY, timer: SHRINK_WARNING_TIME });
        }

        // Update bounds for next shrink cycle *after* identifying current layer
        currentGridBounds.minX++;
        currentGridBounds.maxX--;
        currentGridBounds.minY++;
        currentGridBounds.maxY--;
        
        // When maze shrinks, sometimes add a new power-up in the middle
        if (Math.random() < 0.5 && powerUps.length < 3) {
            const midX = Math.floor((currentGridBounds.minX + currentGridBounds.maxX) / 2);
            const midY = Math.floor((currentGridBounds.minY + currentGridBounds.maxY) / 2);
            
            if (grid[midY][midX] === 0) {
                const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
                powerUps.push(new PowerUp(
                    midX * CELL_SIZE + CELL_SIZE / 2,
                    midY * CELL_SIZE + CELL_SIZE / 2,
                    type
                ));
                createParticles(
                    midX * CELL_SIZE + CELL_SIZE / 2,
                    midY * CELL_SIZE + CELL_SIZE / 2,
                    HIGHLIGHT_COLOR,
                    10
                );
            }
        }
    }
}

// Add a victory display function
function showVictoryMessage() {
    // Create a victory banner
    const victoryBanner = document.createElement('div');
    victoryBanner.textContent = `VICTORY! Score: ${score}`;
    victoryBanner.style.position = 'absolute';
    victoryBanner.style.top = '50%';
    victoryBanner.style.left = '50%';
    victoryBanner.style.transform = 'translate(-50%, -50%)';
    victoryBanner.style.background = 'rgba(10,10,40,0.8)';
    victoryBanner.style.color = GEM_COLOR;
    victoryBanner.style.fontSize = '36px';
    victoryBanner.style.padding = '20px 40px';
    victoryBanner.style.borderRadius = '10px';
    victoryBanner.style.fontWeight = 'bold';
    victoryBanner.style.boxShadow = `0 0 20px ${HIGHLIGHT_COLOR}`;
    victoryBanner.style.textAlign = 'center';
    victoryBanner.style.zIndex = '100';
    document.body.appendChild(victoryBanner);
    
    // Create celebration particles
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            createParticles(
                Math.random() * canvas.width,
                Math.random() * canvas.height,
                [GEM_COLOR, PLAYER_COLOR, HIGHLIGHT_COLOR][Math.floor(Math.random() * 3)],
                5
            );
        }, i * 30);
    }
    
    // Remove the banner after the delay
    setTimeout(() => {
        document.body.removeChild(victoryBanner);
    }, 2900);
    
    // Play a victory sound if available
    if (sounds.gemCollect) {
        // Play multiple times for a victory theme
        setTimeout(() => sounds.gemCollect(), 0);
        setTimeout(() => sounds.gemCollect(), 200);
        setTimeout(() => sounds.gemCollect(), 400);
        setTimeout(() => sounds.powerUp(), 700);
    }
}

// --- Game Loop ---
let lastTime = 0;
function gameLoop(currentTime) {
    const deltaTime = currentTime - lastTime;
    const interval = 1000 / FPS;

    if (deltaTime >= interval) {
        lastTime = currentTime - (deltaTime % interval);

        if (gameState === 'start') {
            drawStartScreen();
        } else if (gameState === 'playing') {
            // Update game state
            updatePlayer();
            updateEnemies();
            shrinkMaze(currentTime);
            
            // Check if all gems are collected for a win condition
            if (gems.length === 0) {
                // Create more gems and add an enemy
                placeGems();
                
                // Add an enemy every other level
                if (enemies.length < 8 && score % NUM_GEMS === 0) {
                    placeEnemies();
                }
                
                // Create victory particles
                createParticles(player.x, player.y, GEM_COLOR, 30);
            }

            // Draw everything
            drawMaze();
            drawPowerUps();
            drawGems();
            drawParticles();
            drawEnemies();
            drawPlayer();
            drawActiveEffects();
            
        } else if (gameState === 'gameOver') {
            // Draw final state under the overlay
            drawMaze();
            drawGems();
            drawEnemies();
            drawParticles();
            
            // Draw game over screen last
            drawGameOverScreen();
        }
    }

    requestAnimationFrame(gameLoop);
}

// --- Initialization ---
function startGame() {
    // Try to initialize audio on user interaction
    if (audioCtx === null && soundEnabled) {
        initSounds();
    }

    score = 0;
    scoreDisplay.textContent = `Score: ${score}`;
    lastShrinkTime = performance.now();
    shrinkingWalls = []; // Clear shrinking walls list
    particles = []; // Clear particles

    initializeMaze(); // Generate new maze layout

    // Reset player position and properties
    player.x = CELL_SIZE * 1.5;
    player.y = CELL_SIZE * 1.5;
    player.vx = 0;
    player.vy = 0;
    player.targetVx = 0;
    player.targetVy = 0;
    player.trail = [];
    player.powerUps = {
        speed: 0,
        invincibility: 0,
        ghost: 0
    };

    placeGems(); // Place new gems
    placePowerUps(); // Place power-ups
    placeEnemies(); // Place new enemies

    keys = {}; // Clear any held keys
    gameState = 'playing';
    
    // Play game start sound
    if (sounds.gameStart) sounds.gameStart();
}

// --- Input Handling ---
let keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    // Prevent default arrow key scrolling
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
    }
    // Start game on any key press from start screen
    if (gameState === 'start' || gameState === 'gameOver') {
        startGame();
    }

    // Quick restart with 'r' key
    if ((e.key === 'r' || e.key === 'R') && gameState === 'playing') {
        // Quick restart - keep score but regenerate maze
        const currentScore = score;
        startGame();
        score = currentScore; // Keep the current score
        scoreDisplay.textContent = `Score: ${score}`;
    }

    // M key toggles mute
    if (e.key === 'm' || e.key === 'M') {
        soundEnabled = !soundEnabled;
        // Show a sound toggle indicator
        const muteIndicator = document.createElement('div');
        muteIndicator.textContent = soundEnabled ? 'Sound On' : 'Sound Off';
        muteIndicator.style.position = 'absolute';
        muteIndicator.style.top = '50px';
        muteIndicator.style.right = '20px';
        muteIndicator.style.background = 'rgba(0,0,0,0.5)';
        muteIndicator.style.color = 'white';
        muteIndicator.style.padding = '5px 10px';
        muteIndicator.style.borderRadius = '5px';
        muteIndicator.style.transition = 'opacity 1s';
        document.body.appendChild(muteIndicator);
        
        // Remove after 2 seconds
        setTimeout(() => {
            muteIndicator.style.opacity = '0';
            setTimeout(() => document.body.removeChild(muteIndicator), 1000);
        }, 1000);
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Add the missing handleInput function
function handleInput() {
    // Store desired velocity based on input
    player.targetVx = 0;
    player.targetVy = 0;

    if (keys['ArrowLeft'] || keys['a']) player.targetVx = -1;
    if (keys['ArrowRight'] || keys['d']) player.targetVx = 1;
    if (keys['ArrowUp'] || keys['w']) player.targetVy = -1;
    if (keys['ArrowDown'] || keys['s']) player.targetVy = 1;

    // Prioritize horizontal movement if both keys are pressed
    if (player.targetVx !== 0) player.targetVy = 0;
}

// Also add the missing getGridValueAt function
function getGridValueAt(pixelX, pixelY) {
    const gridX = Math.floor(pixelX / CELL_SIZE);
    const gridY = Math.floor(pixelY / CELL_SIZE);
    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
        return 1; // Treat out of bounds as wall
    }
    return grid[gridY][gridX];
}

// Add the missing checkEnemyCollision function
function checkEnemyCollision() {
    const playerRadius = player.size / 2;
    for (const enemy of enemies) {
        const enemyRadius = enemy.size / 2; // Approximate enemy as circle for collision
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < playerRadius + enemyRadius) {
            return true; // Collision detected
        }
    }
    return false;
}

// Add the missing updateEnemies function
function updateEnemies() {
    const ENEMY_SPEED = PLAYER_SPEED * 0.5; // Base speed for both types
    const CHASER_SPEED = ENEMY_SPEED * 1.1;  // Chasers are slightly faster
    const WANDERER_SPEED = ENEMY_SPEED * 0.9; // Wanderers are slightly slower
    
    const CHASER_COOLDOWN = 0.5 * FPS;  // Chasers make decisions more frequently
    const WANDERER_COOLDOWN = 1.5 * FPS; // Wanderers change direction less frequently

    enemies.forEach(enemy => {
        enemy.moveCooldown -= 1;
        
        // Update enemy position in the grid for tracking
        enemy.gridX = Math.floor(enemy.x / CELL_SIZE);
        enemy.gridY = Math.floor(enemy.y / CELL_SIZE);
        
        // Animate eyes
        enemy.eyes.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.eyes.blinkTimer -= 1;
        if (enemy.eyes.blinkTimer <= 0) {
            enemy.eyes.blinkTimer = Math.random() * 100 + 50; // Random blink timing
        }

        // Different behavior based on enemy type
        if (enemy.moveCooldown <= 0) {
            let currentSpeed = enemy.type === ENEMY_TYPES.CHASER ? CHASER_SPEED : WANDERER_SPEED;
            
            // Get current grid position
            const currentGridX = Math.floor(enemy.x / CELL_SIZE);
            const currentGridY = Math.floor(enemy.y / CELL_SIZE);
            const playerGridX = Math.floor(player.x / CELL_SIZE);
            const playerGridY = Math.floor(player.y / CELL_SIZE);
            
            // Get possible moves (adjacent open cells)
            const possibleMoves = [];
            const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // N, S, W, E
            
            for (const [dx, dy] of directions) {
                const nextGridX = currentGridX + dx;
                const nextGridY = currentGridY + dy;
                if (getGridValueAt(nextGridX * CELL_SIZE + CELL_SIZE / 2, nextGridY * CELL_SIZE + CELL_SIZE / 2) === 0) {
                    possibleMoves.push({ 
                        vx: dx * currentSpeed, 
                        vy: dy * currentSpeed,
                        dx: dx, // Store direction units for decision making
                        dy: dy
                    });
                }
            }
            
            if (possibleMoves.length > 0) {
                if (enemy.type === ENEMY_TYPES.CHASER) {
                    // CHASER BEHAVIOR: Try to move towards player
                    
                    // First check if player is in direct line of sight
                    let targetMove = null;
                    if (currentGridX === playerGridX) { // Same column
                        let pathClear = true;
                        let step = Math.sign(playerGridY - currentGridY);
                        for (let y = currentGridY + step; y !== playerGridY; y += step) {
                            if (grid[y][currentGridX] === 1) { pathClear = false; break; }
                        }
                        if (pathClear && step !== 0) {
                            // Direct path available vertically
                            targetMove = possibleMoves.find(m => m.dy === step && m.dx === 0);
                        }
                    } else if (currentGridY === playerGridY) { // Same row
                        let pathClear = true;
                        let step = Math.sign(playerGridX - currentGridX);
                        for (let x = currentGridX + step; x !== playerGridX; x += step) {
                            if (grid[currentGridY][x] === 1) { pathClear = false; break; }
                        }
                        if (pathClear && step !== 0) {
                            // Direct path available horizontally
                            targetMove = possibleMoves.find(m => m.dx === step && m.dy === 0);
                        }
                    }
                    
                    // If no direct path, choose move that gets closer to player
                    if (!targetMove) {
                        // Determine which axis has greater distance to player
                        const xDist = Math.abs(playerGridX - currentGridX);
                        const yDist = Math.abs(playerGridY - currentGridY);
                        
                        if (xDist >= yDist) {
                            // Prioritize horizontal movement
                            const xStep = Math.sign(playerGridX - currentGridX);
                            targetMove = possibleMoves.find(m => m.dx === xStep && m.dy === 0);
                            
                            // If horizontal move is blocked, try vertical
                            if (!targetMove) {
                                const yStep = Math.sign(playerGridY - currentGridY);
                                targetMove = possibleMoves.find(m => m.dy === yStep && m.dx === 0);
                            }
                        } else {
                            // Prioritize vertical movement
                            const yStep = Math.sign(playerGridY - currentGridY);
                            targetMove = possibleMoves.find(m => m.dy === yStep && m.dx === 0);
                            
                            // If vertical move is blocked, try horizontal
                            if (!targetMove) {
                                const xStep = Math.sign(playerGridX - currentGridX);
                                targetMove = possibleMoves.find(m => m.dx === xStep && m.dy === 0);
                            }
                        }
                    }
                    
                    // If still no good move, pick a random valid move
                    if (!targetMove) {
                        targetMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                    }
                    
                    enemy.vx = targetMove.vx;
                    enemy.vy = targetMove.vy;
                    enemy.moveCooldown = CHASER_COOLDOWN;
                    
                } else { // WANDERER BEHAVIOR
                    // Pick a random direction, but try not to reverse direction if possible
                    let validMoves = possibleMoves.filter(move => 
                        move.vx !== -enemy.vx || move.vy !== -enemy.vy
                    );
                    
                    if (validMoves.length === 0) {
                        validMoves = possibleMoves; // Must reverse if it's the only option
                    }
                    
                    const move = validMoves[Math.floor(Math.random() * validMoves.length)];
                    enemy.vx = move.vx;
                    enemy.vy = move.vy;
                    
                    // Wanderers keep moving in the same direction longer
                    enemy.moveCooldown = WANDERER_COOLDOWN + Math.random() * WANDERER_COOLDOWN/2;
                }
            } else {
                // No valid moves, stay still
                enemy.vx = 0;
                enemy.vy = 0;
                enemy.moveCooldown = 10; // Short cooldown to try again soon
            }
        }

        // --- Enemy Collision & Movement ---
        const nextX = enemy.x + enemy.vx;
        const nextY = enemy.y + enemy.vy;
        const enemyHalfSize = enemy.size / 2 - 1; // Padding

        let collisionX = false;
        let collisionY = false;

        // Check X collision
        if (enemy.vx !== 0) {
            const checkPixelX = enemy.vx > 0 ? nextX + enemyHalfSize : nextX - enemyHalfSize;
            if (getGridValueAt(checkPixelX, enemy.y - enemyHalfSize) === 1 ||
                getGridValueAt(checkPixelX, enemy.y + enemyHalfSize) === 1) {
                collisionX = true;
                enemy.x = enemy.vx > 0 ? 
                    Math.floor(enemy.x / CELL_SIZE) * CELL_SIZE + CELL_SIZE - enemyHalfSize - 1 : 
                    Math.floor(enemy.x / CELL_SIZE) * CELL_SIZE + enemyHalfSize + 1;
                enemy.vx = 0;
                enemy.moveCooldown = 0; // Force direction change if bumped
            }
        }
        
        // Check Y collision
        if (enemy.vy !== 0) {
            const checkPixelY = enemy.vy > 0 ? nextY + enemyHalfSize : nextY - enemyHalfSize;
            if (getGridValueAt(enemy.x - enemyHalfSize, checkPixelY) === 1 ||
                getGridValueAt(enemy.x + enemyHalfSize, checkPixelY) === 1) {
                collisionY = true;
                enemy.y = enemy.vy > 0 ? 
                    Math.floor(enemy.y / CELL_SIZE) * CELL_SIZE + CELL_SIZE - enemyHalfSize - 1 : 
                    Math.floor(enemy.y / CELL_SIZE) * CELL_SIZE + enemyHalfSize + 1;
                enemy.vy = 0;
                enemy.moveCooldown = 0; // Force direction change
            }
        }

        // Apply movement if no collision
        if (!collisionX) enemy.x = nextX;
        if (!collisionY) enemy.y = nextY;

        // Keep enemies within canvas bounds
        enemy.x = Math.max(enemy.size / 2, Math.min(canvas.width - enemy.size / 2, enemy.x));
        enemy.y = Math.max(enemy.size / 2, Math.min(canvas.height - enemy.size / 2, enemy.y));
    });
}

// Start the game loop without waiting for audio initialization
requestAnimationFrame(gameLoop);
