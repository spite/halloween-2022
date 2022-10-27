import {
  scene,
  renderer,
  addResize,
  resize,
  camera,
  getControls,
} from "../modules/renderer.js";
import {
  DynamicDrawUsage,
  PointLight,
  Raycaster,
  PlaneBufferGeometry,
  Mesh,
  Vector2,
  IcosahedronBufferGeometry,
  InstancedMesh,
  HemisphereLight,
  Object3D,
  sRGBEncoding,
  Vector3,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  MeshBasicMaterial,
  Quaternion,
} from "three";
import { GLTFLoader } from "../third_party/GLTFLoader.js";
import { Particle } from "./Particle.js";
import { Physics } from "./Physics.js";
import { Attraction } from "./Attraction.js";
import { Collision } from "./Collision.js";
import { clamp, randomInRange, map } from "../modules/Maf.js";
import { Verlet } from "./Verlet.js";
import { Post } from "./post.js";
import {
  warm,
  natural,
  natural2,
  circus,
  circus2,
  warm2,
  warm3,
} from "../modules/palettes.js";
import { GradientLinear } from "../modules/gradient-linear.js";
import { initHdrEnv } from "../modules/hdri.js";
import { Matrix4 } from "../third_party/three.module.js";
// import { capture } from "../modules/capture.js";

const controls = getControls();

camera.position.set(1, 1, 1).normalize().multiplyScalar(5);

let gradient = new GradientLinear(warm);

const post = new Post(renderer);
renderer.setClearColor(0x202020, 1);
const physics = new Physics(new Verlet());

const raycaster = new Raycaster();
const mouse = new Vector2(0, 0);
const plane = new Mesh(new PlaneBufferGeometry(1000, 1000), new Mesh());
plane.visible = false;
scene.add(plane);
const point = new Vector3(0, 0, 0);
const nextPoint = new Vector3(0, 0, 0);

renderer.shadowMap.type = PCFSoftShadowMap;
renderer.shadowMap.enabled = true;

function hitPoint() {
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(plane);

  if (intersects.length) {
    nextPoint.copy(intersects[0].point);
  }
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener("pointermove", onMouseMove, false);
window.addEventListener("pointerdown", onMouseMove, false);

const attraction = new Attraction(point, 20, 0.02);
const repulsion = new Attraction(point, 1.1, -0.4);
const collide = new Collision();

let count = 800;
const maxCount = 2000;
let mesh;
let mesh2;

async function load() {
  const loader = new GLTFLoader();
  const pumpkin = new Promise((resolve, reject) => {
    // https://sketchfab.com/3d-models/pumpkin-lowpoly-4ba264c53df944efbd977072a2637d91
    // Pumpkin Lowpoly by Yumy Cubillos
    loader.load("pumpkin_lowpoly.glb", (e) => {
      const pumpkin =
        e.scene.children[0].children[0].children[0].children[1].children[0];
      mesh = new InstancedMesh(
        pumpkin.geometry,
        pumpkin.material,
        maxCount / 2
      );
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.count = count / 2;
      scene.add(mesh);

      resolve();
    });
  });
  // const ghost = new Promise((resolve, reject) => {
  //   // https://sketchfab.com/3d-models/skull-5efad9cc8355428d8a048fd79a18f5d4
  //   // Skull by Thomas Andris
  //   loader.load("ghost_game_ready.glb", (e) => {
  //     const skull =
  //       e.scene.children[0].children[0].children[0].children[0].children[0];
  //     mesh2 = new InstancedMesh(skull.geometry, skull.material, maxCount / 2);
  //     mesh2.geometry.scale(0.03, 0.03, 0.03);
  //     mesh2.instanceMatrix.setUsage(DynamicDrawUsage);
  //     mesh2.castShadow = mesh2.receiveShadow = true;
  //     mesh2.count = count / 2;
  //     scene.add(mesh2);

  //     resolve();
  //   });
  // });
  const skull = new Promise((resolve, reject) => {
    // https://sketchfab.com/3d-models/skull-5efad9cc8355428d8a048fd79a18f5d4
    // Skull by Thomas Andris
    loader.load("skull.glb", (e) => {
      const skull = e.scene.children[0].children[0].children[0];
      mesh2 = new InstancedMesh(skull.geometry, skull.material, maxCount / 2);
      mesh2.geometry.scale(1.5, 1.5, 1.5);
      mesh2.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh2.castShadow = mesh2.receiveShadow = true;
      mesh2.count = count / 2;
      scene.add(mesh2);
      resolve();
    });
  });
  return Promise.all([pumpkin, skull]);
}

let min = 0.01;
let max = 0.03;

function boxMullerTransform() {
  const u1 = Math.random();
  const u2 = Math.random();

  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

  return { z0, z1 };
}

function getNormallyDistributedRandomNumber(mean, stddev) {
  const { z0, _ } = boxMullerTransform();

  return z0 * stddev + mean;
}

function addParticles() {
  for (let i = physics.particles.length; i < count; i++) {
    const particle = new Particle(
      0.1 * getNormallyDistributedRandomNumber(0.05, 0.01)
    );
    particle.radius = particle.mass * 20;
    particle.roll = randomInRange(0, 2 * Math.PI);
    particle.rollSpeed = particle.mass * 10;
    particle.rotation = new Quaternion(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();

    particle.moveTo(
      new Vector3(
        randomInRange(-1, 1),
        randomInRange(-1, 1),
        randomInRange(-1, 1)
      )
    );
    particle.behaviours.push(attraction);
    particle.behaviours.push(repulsion);
    particle.behaviours.push(collide);

    collide.pool.push(particle);

    physics.particles.push(particle);

    // mesh.setColorAt(i, gradient.getAt(map(min, max, 0, 1, particle.mass)));
  }
  // mesh.instanceColor.needsUpdate = true;

  while (physics.particles.length > count) {
    physics.particles.pop();
    collide.pool.pop();
  }
}

function randomizeColors() {
  const palettes = [warm, natural, natural2, circus, circus2, warm2, warm3];
  const palette = palettes[Math.floor(Math.random() * palettes.length)];
  gradient = new GradientLinear(palette);
  min = randomInRange(0.001, 0.005);
  max = randomInRange(0.01, 0.03);
  for (let i = 0; i < physics.particles.length; i++) {
    const particle = physics.particles[i];
    particle.mass = randomInRange(min, max);
    // mesh.setColorAt(i, gradient.getAt(map(min, max, 0, 1, particle.mass)));
  }
  // mesh.instanceColor.needsUpdate = true;
}

function randomize() {
  material.roughness = randomInRange(0.2, 0.8);
  material.metalness = randomInRange(0, 0.2);
  randomizeColors();
}

const dummy = new Object3D();

const light = new PointLight(0xffffff, 1, 100);
scene.add(light);
light.castShadow = true;

const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 0.5);
scene.add(hemiLight);

const center = new Mesh(
  new IcosahedronBufferGeometry(0.1, 10),
  new MeshBasicMaterial({ color: 0xffffff })
);
scene.add(center);

const prevPoint = new Vector3();
const t = new Vector3();

let running = true;

function setCount(c) {
  count = clamp(c, 0, maxCount);
  mesh.count = count / 2;
  mesh2.count = count / 2;
  addParticles();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    running = !running;
  }
  if (e.code === "KeyR") {
    randomize();
  }
  if (e.key === "-") {
    setCount(count - 100);
  }
  if (e.key === "+") {
    setCount(count + 100);
  }
});

document.querySelector("#minusBtn").addEventListener("click", (e) => {
  setCount(count - 100);
});

document.querySelector("#plusBtn").addEventListener("click", (e) => {
  setCount(count + 100);
});

document.querySelector("#pauseBtn").addEventListener("click", (e) => {
  running = !running;
});

document.querySelector("#randomizeBtn").addEventListener("click", (e) => {
  randomize();
});

let prevTime = performance.now();

function render() {
  plane.lookAt(camera.position);

  hitPoint();
  point.lerp(nextPoint, 0.1);

  light.position.copy(point);
  center.position.copy(point);
  center.lookAt(prevPoint);
  t.copy(point).sub(prevPoint);
  center.scale.x = clamp(1 - t.length() * 2, 0.1, 10);
  center.scale.y = clamp(1 - t.length() * 2, 0.1, 10);
  center.scale.z = 1 + t.length() * 10;
  prevPoint.copy(point);

  const time = performance.now();
  const dt = time - prevTime;
  prevTime = time;

  if (running) {
    physics.step(dt);

    const q = new Quaternion();
    const tmp = new Vector3();
    const mat = new Matrix4();
    const rot = new Matrix4();
    const up = new Vector3(0, 1, 0);

    for (let i = 0; i < physics.particles.length; i++) {
      const p = physics.particles[i];
      dummy.position.copy(p.position);
      const v = Math.log(1 + p.velocity.length() * p.mass * 5);
      const f = 1.5;
      dummy.scale
        .set(
          clamp(p.mass - v, p.mass / f, p.mass),
          clamp(p.mass - v, p.mass / f, p.mass),
          clamp(p.mass - v, p.mass / f, p.mass)
        )
        .multiplyScalar(10);
      t.copy(p.position).add(p.velocity);
      rot.makeRotationX(p.roll + (p.rollSpeed * time) / 1000);
      mat.lookAt(p.position, t, up);
      rot.multiply(mat);
      q.setFromRotationMatrix(rot);
      p.rotation.rotateTowards(q, 0.05);
      dummy.quaternion.copy(p.rotation);
      dummy.updateMatrix();
      if (i < count / 2) {
        mesh.setMatrixAt(i, dummy.matrix);
      } else {
        mesh2.setMatrixAt(i - count / 2, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh2.instanceMatrix.needsUpdate = true;
  }
  // renderer.render(scene, camera);
  post.render(scene, camera);
  // capture(renderer.domElement);

  renderer.setAnimationLoop(render);
}

function myResize(w, h, dpr) {
  post.setSize(w * dpr, h * dpr);
}
addResize(myResize);

async function init() {
  await load();
  addParticles();
  const envMap = await initHdrEnv("studio_small_03_1k.hdr", renderer);
  // mesh.material.wireframe = true;
  mesh.material.envMap = envMap;
  mesh.material.envMapIntensity = 0.2;
  mesh2.material.envMap = envMap;
  mesh2.material.envMapIntensity = 0.2;
  resize();
  render();
}

init();
