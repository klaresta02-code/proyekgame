import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// --- SETUP SCENE ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 35, 0); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(10, 50, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.left = -15; sunLight.shadow.camera.right = 15;
sunLight.shadow.camera.top = 15; sunLight.shadow.camera.bottom = -15;
scene.add(sunLight);

// --- GAME STATE ---
let score = 0;
let gameStarted = false; 
let timeLeft = 60;
const fishes = [];
const pellets = [];
const textureLoader = new THREE.TextureLoader();
const objLoader = new OBJLoader();
let activeFishIndex = -1;

// UI Elements
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer-display');
const timeInput = document.getElementById('time-input');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const controlsEl = document.getElementById('controls');

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- LOAD BACKGROUND ---
try {
    textureLoader.load('background.jpeg', (tex) => {
        scene.background = tex;
    });
} catch(e) {
    console.log("Background tidak ada");
}

// --- LANTAI ---
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x006994, transparent: true, opacity: 0.3, roughness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -4;
floor.receiveShadow = true;
scene.add(floor);

// --- PELLET ---
function createPellet() {
    const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.3),
        new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xaaaa00, emissiveIntensity: 0.2 })
    );
    p.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 18);
    p.castShadow = true; p.receiveShadow = true;
    scene.add(p);
    pellets.push(p);
}

for(let i=0; i<10; i++) createPellet();

// --- TANK LINES ---
scene.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(20, 8, 20)),
    new THREE.LineBasicMaterial({ color: 0x00aaff, opacity: 0.5, transparent: true })
));

// --- LOAD IKAN ---
function loadFishModel(url, x, z, color) {
    objLoader.load(
        url,
        (obj) => {
            obj.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: 0.4,
                        metalness: 0.1
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            obj.scale.set(0.1, 0.1, 0.1);
            obj.position.set(x, 0, z);
            obj.rotation.y = 0;
            scene.add(obj);
            fishes.push(obj);
            console.log("Ikan berhasil dimuat!");
        },
        (xhr) => { console.log((xhr.loaded / xhr.total * 100) + '% loaded'); },
        (error) => { createFallbackFish(x, z, color); }
    );
}

function createFallbackFish(x, z, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.3), mat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), mat);
    head.position.x = 0.8;
    body.castShadow = true; head.castShadow = true;
    group.add(body, head);
    group.scale.set(0.1, 0.1, 0.1);
    group.position.set(x, 0, z);
    group.rotation.y = 0;
    scene.add(group);
    fishes.push(group);
}

loadFishModel('3d-model.obj', -5, 0, 0xfd71a3);
loadFishModel('3d-model.obj', 5, 0, 0x00ff00);

// --- INTERAKSI: KEYBOARD ---
const keys = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

// === ON-SCREEN CONTROLS (TOUCH) ===
const ctrlButtons = document.querySelectorAll('.ctrl-btn');

ctrlButtons.forEach(btn => {
    const key = btn.getAttribute('data-key');
    
    // Touch Start
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys[key] = true;
        btn.classList.add('active');
    }, { passive: false });
    
    // Touch End
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys[key] = false;
        btn.classList.remove('active');
    }, { passive: false });
    
    // Mouse Click
    btn.addEventListener('mousedown', (e) => {
        keys[key] = true;
        btn.classList.add('active');
    });
    btn.addEventListener('mouseup', (e) => {
        keys[key] = false;
        btn.classList.remove('active');
    });
    btn.addEventListener('mouseleave', (e) => {
        keys[key] = false;
        btn.classList.remove('active');
    });
});

// --- INTERAKSI: DRAG & DROP ---
let isDragging = false;
let dragOffset = new THREE.Vector3();
let draggedFish = null;

window.addEventListener('mousemove', (e) => {
    if (!gameStarted) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (activeFishIndex !== -1) {
        const intersects = raycaster.intersectObject(fishes[activeFishIndex], true);
        document.body.style.cursor = (intersects.length > 0) ? 'pointer' : 'default';
    }

    if (isDragging && draggedFish) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const targetPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, targetPoint);
        if (targetPoint) {
            draggedFish.position.x = THREE.MathUtils.clamp(targetPoint.x - dragOffset.x, -9, 9);
            draggedFish.position.z = THREE.MathUtils.clamp(targetPoint.z - dragOffset.z, -9, 9);
        }
    }
});

window.addEventListener('mousedown', (e) => {
    if (!gameStarted) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    let foundIndex = -1;
    for(let i=0; i<fishes.length; i++) {
        if(raycaster.intersectObject(fishes[i], true).length > 0) {
            foundIndex = i;
            break;
        }
    }

    if (foundIndex !== -1) {
        isDragging = true;
        draggedFish = fishes[foundIndex];
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);
        dragOffset.subVectors(intersectPoint, draggedFish.position);
        setActiveFish(foundIndex);
        document.body.style.cursor = 'grabbing';
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    draggedFish = null;
    document.body.style.cursor = 'default';
});

function setActiveFish(index) {
    activeFishIndex = index;
    fishes.forEach((f, i) => {
        f.traverse(c => {
            if(c.isMesh) c.material.emissive.set(i === index ? 0x333333 : 0x000000);
        });
        const targetScale = i === index ? 0.12 : 0.1;
        f.scale.set(targetScale, targetScale, targetScale);
    });
}

// --- GAME LOGIC ---
function update() {
    if (gameStarted && activeFishIndex !== -1 && !isDragging) {
        const fish = fishes[activeFishIndex];
        
        // Arrow Up = Maju (ke atas layar)
        if (keys['ArrowUp']) fish.position.z -= 0.2;
        // Arrow Down = Mundur (ke bawah layar)
        if (keys['ArrowDown']) fish.position.z += 0.2;
        if (keys['ArrowLeft']) fish.position.x -= 0.2;
        if (keys['ArrowRight']) fish.position.x += 0.2;

        // Rotasi menghadap arah gerakan
        if (keys['ArrowUp']) fish.rotation.y = 0;
        if (keys['ArrowDown']) fish.rotation.y = Math.PI;
        if (keys['ArrowLeft']) fish.rotation.y = Math.PI / 2;
        if (keys['ArrowRight']) fish.rotation.y = -Math.PI / 2;

        // Batas Aquarium
        fish.position.x = THREE.MathUtils.clamp(fish.position.x, -9, 9);
        fish.position.z = THREE.MathUtils.clamp(fish.position.z, -9, 9);

        // Makan Pellet
        for (let i = pellets.length - 1; i >= 0; i--) {
            if (fish.position.distanceTo(pellets[i].position) < 1.5) {
                scene.remove(pellets[i]);
                pellets.splice(i, 1);
                score += 10;
                scoreEl.innerText = score;
                createPellet();
            }
        }
    }
}

// --- TIMER ---
let timerInterval;
function startGame() {
    let inputWaktu = parseInt(timeInput.value);
    if (isNaN(inputWaktu) || inputWaktu < 10) inputWaktu = 60;
    
    timeLeft = inputWaktu;
    gameStarted = true;
    startScreen.style.display = 'none';
    controlsEl.style.display = 'block'; // Tampilkan tombol kontrol HP
    timerEl.innerText = `Waktu: ${timeLeft} detik`;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.innerText = `Waktu: ${timeLeft} detik`;
        if (timeLeft <= 0) endGame();
    }, 1000);
}

function endGame() {
    gameStarted = false;
    clearInterval(timerInterval);
    timerEl.innerText = "Waktu Habis!";
    timerEl.style.color = "red";
    finalScoreEl.innerText = score;
    gameOverScreen.style.display = 'flex';
    controlsEl.style.display = 'none';
}

document.getElementById('start-btn').addEventListener('click', startGame);

// --- ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    update();
    
    // Animasi pellet melayang
    const time = Date.now() * 0.001;
    pellets.forEach((p, i) => {
        p.position.y += Math.sin(time + i) * 0.005;
    });

    renderer.render(scene, camera);
}

animate();

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
