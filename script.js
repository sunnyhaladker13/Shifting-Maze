const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const gameContainer = document.getElementById('gameContainer');
const soundToggle = document.getElementById('soundToggle');
const controlPad = document.getElementById('controlPad');

// --- Device Detection ---
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);

// --- Enhanced Neobrutalist Color Palette ---
const BG_COLOR = '#1a1a2e';      // Darker Blue-Gray
const WALL_COLOR = '#16213e';    // Deep Blue
const PLAYER_COLOR = '#0ead69';  // Bright Green (easier to see)
const GEM_COLOR = '#ff7700';     // Orange
const ENEMY_COLOR = '#e94560';    // Bright Pink-Red
const PATH_COLOR = '#1a1a2e';     // Path color same as background
const HIGHLIGHT_COLOR = '#4cc9f0'; // Cyan for highlights and effects

// --- Game Settings ---
let CELL_SIZE = 32; // Base size - will be adjusted for responsive display
const BASE_CELL_SIZE = 32;
const GRID_WIDTH = 21; // Use odd numbers for better maze generation
const GRID_HEIGHT = 15; // Use odd numbers for better maze generation
let canvasWidth = GRID_WIDTH * CELL_SIZE;
let canvasHeight = GRID_HEIGHT * CELL_SIZE;
const FPS = 60; // Increased for smoother animation
const SHRINK_RATE = 8000; // Time in milliseconds between map shrinks (longer to give more play time)
let PLAYER_SPEED = CELL_SIZE / 6; // Speed will also scale
const WALL_THICKNESS = 5; // Thicker walls for better visibility
const GLOW_INTENSITY = 15; // Size of glow effect in pixels

// --- Responsive Canvas Sizing ---
function resizeCanvas() {
    const maxWidth = Math.min(window.innerWidth - 20, 800);
    const maxHeight = Math.min(window.innerHeight - 80, 600);
    
    // Calculate the appropriate cell size
    const horizontalCellSize = maxWidth / GRID_WIDTH;
    const verticalCellSize = maxHeight / GRID_HEIGHT;
    CELL_SIZE = Math.floor(Math.min(horizontalCellSize, verticalCellSize));
    
    // Ensure minimum size
    CELL_SIZE = Math.max(CELL_SIZE, 16);
    
    // Update canvas dimensions
    canvasWidth = GRID_WIDTH * CELL_SIZE;
    canvasHeight = GRID_HEIGHT * CELL_SIZE;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Scale player speed based on cell size ratio
    PLAYER_SPEED = CELL_SIZE / 6;
}

// Initialize canvas size
resizeCanvas();
window.addEventListener('resize', () => {
    resizeCanvas();
    if (gameState === 'playing') {
        // Adjust player, enemies and items positions based on new cell size
        adjustGameElementsForResize();
    }
});

// Function to adjust game elements after resize
function adjustGameElementsForResize() {
    // Adjust player position
    const playerGridX = Math.floor(player.x / (canvas.width / GRID_WIDTH));
    const playerGridY = Math.floor(player.y / (canvas.height / GRID_HEIGHT));
    player.x = (playerGridX + 0.5) * CELL_SIZE;
    player.y = (playerGridY + 0.5) * CELL_SIZE;
    player.size = CELL_SIZE * 0.6;
    
    // Adjust enemies
    enemies.forEach(enemy => {
        const enemyGridX = Math.floor(enemy.x / (canvas.width / GRID_WIDTH));
        const enemyGridY = Math.floor(enemy.y / (canvas.height / GRID_HEIGHT));
        enemy.x = (enemyGridX + 0.5) * CELL_SIZE;
        enemy.y = (enemyGridY + 0.5) * CELL_SIZE;
        enemy.size = enemy.type === ENEMY_TYPES.CHASER ? CELL_SIZE * 0.7 : CELL_SIZE * 0.65;
    });
    
    // Adjust gems
    gems.forEach(gem => {
        const gemGridX = gem.gridX;
        const gemGridY = gem.gridY;
        gem.x = (gemGridX + 0.5) * CELL_SIZE;
        gem.y = (gemGridY + 0.5) * CELL_SIZE;
        gem.size = CELL_SIZE * 0.4;
    });
    
    // Adjust power-ups
    powerUps.forEach(powerUp => {
        const puGridX = Math.floor(powerUp.x / (canvas.width / GRID_WIDTH));
        const puGridY = Math.floor(powerUp.y / (canvas.height / GRID_HEIGHT));
        powerUp.x = (puGridX + 0.5) * CELL_SIZE;
        powerUp.y = (puGridY + 0.5) * CELL_SIZE;
        powerUp.size = CELL_SIZE * 0.5;
    });
}

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

// Update sound toggle button to reflect current state
function updateSoundToggleUI() {
    soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
}

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
    angle: 0, // For rotation animation
    touchActive: false, // flag for continuous movement on touch devices
    touchDirection: { x: 0, y: 0 } // direction from touch input
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

    // Apply touch-based movement if active
    if (player.touchActive) {
        player.targetVx = player.touchDirection.x;
        player.targetVy = player.touchDirection.y;
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
// ...existing code...

// --- Game Loop ---
// ...existing code...

// --- Initialization ---
function startGame() {
    // Try to initialize audio on user interaction
    if (audioCtx === null && soundEnabled) {
        initSounds();
    }
    
    // Show control pad on mobile
    if (isMobile) {
        controlPad.style.display = 'block';
    } else {
        controlPad.style.display = 'none';
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
    
    // Reset touch state
    player.touchActive = false;
    player.touchDirection = { x: 0, y: 0 };
}

// --- Input Handling ---
let keys = {};

// Desktop key events
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    // Prevent default arrow key scrolling
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Space"].includes(e.key)) {
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
        updateSoundToggleUI();
        showSoundNotification();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Show notification for sound toggle
function showSoundNotification() {
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

// --- Mobile Touch Controls ---

// Sound toggle button
soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateSoundToggleUI();
    // Try to initialize audio context on first click
    if (audioCtx === null && soundEnabled) {
        initSounds();
    }
});

// Touch control variables
let touchStartX = 0;
let touchStartY = 0;
let lastTapTime = 0;

// Process swipe direction
function handleSwipe(endX, endY) {
    const deltaX = endX - touchStartX;
    const deltaY = endY - touchStartY;
    
    // Minimum distance for a swipe
    const minDistance = 30;
    
    if (Math.abs(deltaX) < minDistance && Math.abs(deltaY) < minDistance) {
        return; // Not a swipe - too short
    }
    
    // Determine primary direction
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        player.touchDirection.x = deltaX > 0 ? 1 : -1;
        player.touchDirection.y = 0;
    } else {
        // Vertical swipe
        player.touchDirection.x = 0;
        player.touchDirection.y = deltaY > 0 ? 1 : -1;
    }
    
    player.touchActive = true;
}

// Touch event handlers for canvas
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    
    // Check for double tap (for level restart)
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;
    if (tapLength < 300 && tapLength > 0 && gameState === 'playing') {
        // Double tap detected, restart level
        const currentScore = score;
        startGame();
        score = currentScore;
        scoreDisplay.textContent = `Score: ${score}`;
    }
    lastTapTime = currentTime;
    
    // Start game from start screen
    if (gameState === 'start' || gameState === 'gameOver') {
        startGame();
    }
}, false);

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (gameState !== 'playing') return;
    
    const touch = e.touches[0];
    handleSwipe(touch.clientX, touch.clientY);
}, false);

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    // Stop movement when touch ends
    if (player.touchActive) {
        player.touchActive = false;
        player.touchDirection = { x: 0, y: 0 };
    }
}, false);

// On-screen control pad
if (isMobile) {
    // Direction button handlers
    document.getElementById('upBtn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        player.touchDirection = { x: 0, y: -1 };
        player.touchActive = true;
    });
    
    document.getElementById('leftBtn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        player.touchDirection = { x: -1, y: 0 };
        player.touchActive = true;
    });
    
    document.getElementById('rightBtn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        player.touchDirection = { x: 1, y: 0 };
        player.touchActive = true;
    });
    
    document.getElementById('downBtn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        player.touchDirection = { x: 0, y: 1 };
        player.touchActive = true;
    });
    
    // Common touchend handler for all buttons
    const directionButtons = document.querySelectorAll('.control-btn');
    directionButtons.forEach(btn => {
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            player.touchActive = false;
            player.touchDirection = { x: 0, y: 0 };
        });
        
        // Cancel movement if touch moves out of the button
        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            player.touchActive = false;
            player.touchDirection = { x: 0, y: 0 };
        });
    });
}

// Handle desktop and mobile input together
function handleInput() {
    // Only apply keyboard controls if touch is not active
    if (!player.touchActive) {
        player.targetVx = 0;
        player.targetVy = 0;

        if (keys['ArrowLeft'] || keys['a']) player.targetVx = -1;
        if (keys['ArrowRight'] || keys['d']) player.targetVx = 1;
        if (keys['ArrowUp'] || keys['w']) player.targetVy = -1;
        if (keys['ArrowDown'] || keys['s']) player.targetVy = 1;

        // Prioritize horizontal movement if both keys are pressed
        if (player.targetVx !== 0) player.targetVy = 0;
    }
    // If touch is active, player.touchDirection is already being used
}

// Prevent browser's default touch actions on mobile
document.addEventListener('touchmove', function(e) {
    if (e.target === canvas) {
        e.preventDefault();
    }
}, { passive: false });

// Also prevent zoom and other gestures
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});

// Setup mobile UI on load
window.addEventListener('load', () => {
    updateSoundToggleUI();
    if (isMobile) {
        controlPad.style.display = 'block';
    }
});

// --- Rest of the code (existing functions) ---
// ...existing code...

// Start the game loop
requestAnimationFrame(gameLoop);
