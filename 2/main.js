import {
  scene,
  renderer,
  addResize,
  resize,
  camera,
} from "../modules/renderer.js";
import {
  DynamicDrawUsage,
  Mesh,
  IcosahedronBufferGeometry,
  InstancedMesh,
  HemisphereLight,
  Object3D,
  Vector3,
  MeshBasicMaterial,
  Quaternion,
} from "../third_party/three.module.js";
import { GLTFLoader } from "../third_party/GLTFLoader.js";
import { Particle } from "./Particle.js";
import { Physics } from "./Physics.js";
import { Attraction } from "./Attraction.js";
import { Collision } from "./Collision.js";
import { clamp, randomInRange, map } from "../modules/Maf.js";
import { Verlet } from "./Verlet.js";
import { Post } from "./post.js";
import { warm3 } from "../modules/palettes.js";
import { GradientLinear } from "../modules/gradient-linear.js";
import { initHdrEnv } from "../modules/hdri.js";
import { Matrix4 } from "../third_party/three.module.js";
import { curl, generateNoiseFunction } from "../modules/curl.js";
import { OrbitControls } from "../third_party/OrbitControls.js";

// import { capture } from "../modules/capture.js";

const camera2 = camera.clone();
const controls = new OrbitControls(camera2, renderer.domElement);
camera2.position.set(1, 1, 1).normalize().multiplyScalar(5);

const gradient = new GradientLinear(warm3);

const post = new Post(renderer);
renderer.setClearColor(0x101010, 1);
const physics = new Physics(new Verlet());
physics.viscosity = 0.005;

const point = new Vector3(0, 0, 0);
const nextPoint = new Vector3(0, 0, 0);

const attraction = new Attraction(point, 200, 0.02);
const repulsion = new Attraction(point, 1.6, -0.4);
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
    loader.load("../assets/pumpkin_lowpoly.glb", (e) => {
      const pumpkin =
        e.scene.children[0].children[0].children[0].children[1].children[0];
      pumpkin.geometry.rotateZ(Math.PI / 2);
      pumpkin.geometry.rotateY(Math.PI / 2);
      pumpkin.geometry.rotateX(-Math.PI / 2);
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
  const skull = new Promise((resolve, reject) => {
    // https://sketchfab.com/3d-models/skull-5efad9cc8355428d8a048fd79a18f5d4
    // Skull by Thomas Andris
    loader.load("../assets/skull.glb", (e) => {
      const skull = e.scene.children[0].children[0].children[0];
      skull.geometry.rotateZ(Math.PI / 2);
      skull.geometry.rotateY(Math.PI / 2);
      skull.geometry.rotateZ(Math.PI / 2);
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

function randomGaussian(v = 3) {
  let r = 0;
  for (let i = v; i > 0; i--) {
    r += Math.random();
  }
  return r / v;
}

const min = 0.003;
const max = 0.009;

function addParticles() {
  for (let i = physics.particles.length; i < count; i++) {
    const mass = map(0, 1, min, max, randomGaussian());
    const particle = new Particle(mass);
    particle.radius = particle.mass * 20;
    particle.roll = randomInRange(0, 2 * Math.PI);
    particle.rollSpeed =
      (0.0001 / particle.mass) * Math.sign(randomInRange(-1, 1));
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
        .normalize()
        .multiplyScalar(randomInRange(1, 3))
    );
    particle.color = gradient.getAt(map(min, max, 0, 1, particle.mass));
    particle.behaviours.push(attraction);
    particle.behaviours.push(repulsion);
    particle.behaviours.push(collide);

    collide.pool.push(particle);

    physics.particles.push(particle);
  }

  while (physics.particles.length > count) {
    physics.particles.pop();
    collide.pool.pop();
  }
  updateColors();
}

function updateColors() {
  for (let i = 0; i < physics.particles.length; i++) {
    const particle = physics.particles[i];
    mesh.setColorAt(i, particle.color);
    mesh2.setColorAt(i, particle.color);
  }
  mesh.instanceColor.needsUpdate = true;
  mesh2.instanceColor.needsUpdate = true;
}

function randomize() {
  repulsion.radius = randomInRange(1.1, 2.5);
  repulsion.strength = randomInRange(-0.2, -0.6);
  for (let i = 0; i < physics.particles.length; i++) {
    const particle = physics.particles[i];
    const mass = map(0, 1, min, max, randomGaussian());
    particle.mass = mass;
    particle.radius = particle.mass * 20;
    particle.rollSpeed = particle.mass;
    particle.color = gradient.getAt(map(min, max, 0, 1, particle.mass));
  }
  updateColors();
}

const dummy = new Object3D();

const hemiLight = new HemisphereLight(0xffffbb, 0x080820, 0.2);
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

function goFullscreen() {
  if (renderer.domElement.webkitRequestFullscreen) {
    renderer.domElement.webkitRequestFullscreen();
  } else {
    renderer.domElement.requestFullscreen();
  }
}

let cam = camera;
function toggleCamera() {
  if (cam === camera) {
    cam = camera2;
  } else {
    cam = camera;
  }
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
  if (e.code === "KeyC") {
    toggleCamera();
  }
  if (e.code === "KeyF") {
    goFullscreen();
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

document.querySelector("#fullscreenBtn").addEventListener("click", (e) => {
  goFullscreen();
});

document.querySelector("#cameraBtn").addEventListener("click", (e) => {
  toggleCamera();
});

let prevTime = performance.now();
const tmp = new Vector3();
let time = 0;
const particleCenter = new Vector3(0, 0, 0);
const cameraRot = new Quaternion();
const cameraFrom = new Vector3(0, 0, 1);
const cameraTo = new Vector3(0, 0, 1);
const fn = generateNoiseFunction();

let frames = 0;
const q = new Quaternion();
const mat = new Matrix4();
const rot = new Matrix4();
const zero = new Vector3(0, 0, 0);
const up = new Vector3(0, 1, 0);

function render() {
  const now = performance.now();
  const dt = now - prevTime;
  prevTime = now;

  if (running) {
    time += dt;
    physics.step(dt);

    const t = time / 1000;
    const r = 0.5 + 0.5 * Math.sin(t);
    const p = new Vector3(t, 0, 0).multiplyScalar(0.8);
    const n = curl(p, fn);
    n.normalize().multiplyScalar(0.1 + 0.9 * r);
    const f = n.clone().copy(n);

    nextPoint.copy(f);

    point.lerp(nextPoint, 0.1);
    point.setLength(5);

    center.position.copy(point);
    center.lookAt(prevPoint);
    tmp.copy(point).sub(prevPoint);
    center.scale.x = clamp(1 - tmp.length() * 2, 0.1, 10);
    center.scale.y = clamp(1 - tmp.length() * 2, 0.1, 10);
    center.scale.z = 1 + tmp.length() * 10;
    prevPoint.copy(point);

    for (const p of physics.particles) {
      particleCenter.add(p.position);
    }
    particleCenter.divideScalar(physics.particles.length);

    for (let i = 0; i < physics.particles.length; i++) {
      const p = physics.particles[i];
      dummy.position.copy(p.position);
      const v = Math.log(1 + p.velocity.length() * p.mass * 5);
      const f = 1.5;
      dummy.scale
        .set(
          clamp(p.mass - v, p.mass / f, p.mass),
          clamp(p.mass - v, p.mass / f, p.mass),
          clamp(p.velocity.length() / 100, 0, 0.1) +
            clamp(p.mass - v, p.mass / f, p.mass)
        )
        .multiplyScalar(10);
      mat.lookAt(zero, p.velocity, up);
      p.roll += p.rollSpeed;
      rot.makeRotationZ(p.roll);
      mat.multiply(rot);
      q.setFromRotationMatrix(mat);
      p.rotation.slerp(q, 5 * p.mass);
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

    camera.position.set(0, 0, 0);
    mat.lookAt(zero, particleCenter, up);
    cameraRot.setFromRotationMatrix(mat);
    camera.quaternion.rotateTowards(cameraRot, 0.025);

    controls.target0.copy(particleCenter);
  }

  // renderer.render(scene, camera);
  post.render(scene, cam);

  // capture(renderer.domElement);

  // if (frames > 50 * 60 && window.capturer.capturing) {
  //   window.capturer.stop();
  //   window.capturer.save();
  // }
  // frames++;

  renderer.setAnimationLoop(render);
}

function myResize(w, h, dpr) {
  camera2.aspect = w / h;
  camera2.updateProjectionMatrix();
  post.setSize(w * dpr, h * dpr);
}
addResize(myResize);

async function init() {
  await load();
  addParticles();
  const envMap = await initHdrEnv("studio_small_03_1k.hdr", renderer);
  mesh.material.envMap = envMap;
  mesh.material.envMapIntensity = 0.2;
  mesh2.material.envMap = envMap;
  mesh2.material.envMapIntensity = 0.2;
  resize();
  render();
}

init();

// window.start = () => {
//   frames = 0;
//   window.capturer.start();
// };
