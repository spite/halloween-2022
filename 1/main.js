import {
  scene,
  getControls,
  renderer,
  camera,
  addResize,
  resize,
} from "../modules/renderer.js";
import { PoissonSphere3D } from "../modules/poisson.js";
import {
  InstancedMesh,
  Matrix4,
  Group,
  Object3D,
  Vector3,
  PCFSoftShadowMap,
  DirectionalLight,
  sRGBEncoding,
  HemisphereLight,
  DynamicDrawUsage,
  Vector2,
} from "three";
import { clamp } from "../modules/Maf.js";
import { TAU } from "../modules/Maf.js";
import { GLTFLoader } from "../third_party/GLTFLoader.js";
import { SSAO } from "./SSAO.js";
import { Post } from "./post.js";
import { DeviceOrientationControls } from "../third_party/DeviceOrientationControls.js";
// import { capture } from "../modules/capture.js";

const ssao = new SSAO();
const post = new Post(renderer);

const controls = getControls();
// controls.enableZoom = false;
controls.enablePan = false;

camera.near = 0.01;
camera.far = 20;
let distance = 1000;

let doControls;
window.addEventListener(
  "deviceorientation",
  (e) => {
    if (e.alpha === null && e.beta === null && e.gamma === null) {
      return;
    }
    if (!doControls) {
      console.log("Switching to Device Orientation Controls.");
      camera.position.set(0, 0, 0);
      distance = 500;
      resize();
      doControls = new DeviceOrientationControls(camera);
    }
  },
  true
);

function randomInRange(a, b) {
  return a + Math.random() * (b - a);
}

const side = 30;
const poisson = new PoissonSphere3D(side, side, side, 2.5);
const points = poisson.calculate();

const particles = [];
for (const pt of points) {
  const toSize = randomInRange(0.5, 2.5);
  const rotx = Math.round(randomInRange(0, 10));
  const roty = Math.round(randomInRange(0, 10));
  particles.push({
    position: pt,
    toPosition: pt.clone(),
    baseRot: randomInRange(0, TAU),
    size: 0,
    toSize,
    rotx,
    toRotx: rotx,
    roty,
    toRoty: roty,
    randDir: new Vector3(
      randomInRange(-1, 1),
      randomInRange(-1, 1),
      randomInRange(-1, 1)
    ),
    randVal: randomInRange(-0.2, 0.2),
  });
}

function relax() {
  const dir = new Vector3();
  const force = new Vector3();
  const tmp = new Vector3();
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    const l = a.toPosition.length();
    force.set(0, 0, 0);
    for (let j = 0; j < particles.length; j++) {
      const b = particles[j];
      if (i !== j) {
        dir.copy(a.toPosition).sub(b.toPosition);
        const l = dir.lengthSq();
        const d = a.size + b.size;
        if (l < d ** 2) {
          force.add(dir.divideScalar(l));
        }
      }
    }
    force.normalize().multiplyScalar(0.01);
    tmp.copy(a.toPosition).add(force).setLength(l);
    a.toPosition.lerp(tmp, 0.5);
  }
}

let mesh;
const group = new Group();
scene.add(group);

function generate(ref) {
  ref.geometry.scale(0.01, 0.01, 0.01);
  ref.geometry.center();
  ref.material.roughness = 0.4;
  mesh = new InstancedMesh(ref.geometry, ref.material, particles.length);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

const mouse = new Vector2(0, 0);
const size = new Vector2();
function onMouseMove(event) {
  renderer.getSize(size);
  mouse.x = (event.clientX / size.x) * 2 - 1;
  mouse.y = (event.clientY / size.y) * 2 - 1;
}

window.addEventListener("pointermove", onMouseMove, false);
window.addEventListener("pointerdown", onMouseMove, false);

function update() {
  const dummy = new Object3D();
  const dir = new Vector3();
  const rot = new Matrix4();
  const x = new Vector3(1, 0, 0);
  const y = new Vector3(0, 1, 0);

  const prob = 0.99;
  const prob2 = 0.6;
  const tmp = new Vector3();
  const tmp2 = new Vector2();

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    const l = p.position.length();
    const dist = p.position.distanceTo(p.toPosition);
    if (dist > 1) {
      p.position.lerp(p.toPosition, 0.1 - 10 / dist);
      p.position.setLength(l);
    } else {
      p.position.lerp(p.toPosition, 0.1);
      p.position.setLength(l);
    }

    tmp.copy(p.toPosition).multiplyScalar(0.01);
    tmp.applyMatrix4(group.matrix);
    const pos = tmp.project(camera);
    tmp2.set(pos.x, -pos.y);
    const d = tmp2.distanceTo(mouse);

    if (d < 0.5) {
      const inc = (0.5 - d) / 2;
      if (randomInRange(0, 1) > prob2) {
        p.toRotx += inc;
      }
      if (randomInRange(0, 1) > prob2) {
        p.toRoty += inc;
      }
    } else {
      const inc = 3;
      if (randomInRange(0, 1) > prob) {
        p.toRotx += randomInRange(-inc, inc);
      }
      if (randomInRange(0, 1) > prob) {
        p.toRoty += randomInRange(-inc, inc);
      }
    }

    p.rotx += (Math.round(p.toRotx) - p.rotx) * 0.1;
    p.roty += (Math.round(p.toRoty) - p.roty) * 0.1;

    p.size += (Math.round(p.toSize) - p.size) * 0.1;

    const s = p.size * 1;
    dir.copy(p).normalize();
    dir.set(0, 0, 1);
    dummy.position.copy(p.position).multiplyScalar(0.01);
    dummy.scale.setScalar(s);
    dummy.lookAt(scene.position);
    dummy.updateMatrix();
    rot.makeRotationAxis(dir, p.baseRot);
    dummy.matrix.multiply(rot);
    rot.makeRotationAxis(x, p.rotx);
    dummy.matrix.multiply(rot);
    rot.makeRotationAxis(y, p.roty);
    dummy.matrix.multiply(rot);
    rot.makeRotationAxis(p.randDir, p.randVal);
    dummy.matrix.multiply(rot);
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

let frames = 0;

function render() {
  if (doControls) {
    doControls.update();
  }
  for (let i = 0; i < 10; i++) {
    relax();
  }
  if (running) {
    group.rotation.y += 0.001;
    group.rotation.x += 0.0001;
    update();
  }
  ssao.render(renderer, scene, camera);
  post.render(ssao.output);

  // capture(renderer.domElement);

  // if (frames > 10 * 60 && window.capturer.capturing) {
  //   window.capturer.stop();
  //   window.capturer.save();
  // }
  // frames++;

  renderer.setAnimationLoop(render);
}

async function load() {
  const loader = new GLTFLoader();
  return await new Promise((resolve, reject) => {
    // https://sketchfab.com/3d-models/pumpkin-lowpoly-4ba264c53df944efbd977072a2637d91
    // Pumpkin Lowpoly by Yumy Cubillos
    loader.load("../assets/pumpkin_lowpoly.glb", (e) => {
      const mesh =
        e.scene.children[0].children[0].children[0].children[1].children[0];
      mesh.geometry.scale(0.47, 0.47, 0.47);
      resolve(mesh);
    });
  });
}

function randomize() {
  for (const p of particles) {
    const rotx = Math.round(randomInRange(0, 10));
    const roty = Math.round(randomInRange(0, 10));
    p.toRotx = rotx;
    p.toRoty = roty;
    p.toSize = randomInRange(0.5, 2.5);
    p.toPosition
      .set(randomInRange(-1, 1), randomInRange(-1, 1), randomInRange(-1, 1))
      .normalize()
      .multiplyScalar(15);
  }
}

function goFullscreen() {
  renderer.domElement.requestFullscreen();
}

let running = true;

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    randomize();
  }
  if (e.code === "Space") {
    running = !running;
  }
  if (e.code === "KeyF") {
    goFullscreen();
  }
});

document.querySelector("#randomizeBtn").addEventListener("click", (e) => {
  randomize();
});

document.querySelector("#pauseBtn").addEventListener("click", (e) => {
  running = !running;
});

document.querySelector("#fullscreenBtn").addEventListener("click", (e) => {
  goFullscreen();
});

renderer.shadowMap.enabled = true;
renderer.outputEncoding = sRGBEncoding;
renderer.shadowMap.type = PCFSoftShadowMap;

const hemiLight = new HemisphereLight(0xe7e9ed, 0x7d828e, 0.2);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const dirLight = new DirectionalLight(0xe0e2e6, 0.5);
dirLight.position.set(-1, 1.75, 1);
scene.add(dirLight);

dirLight.castShadow = true;

dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;

camera.position.set(0, 0, -0.1);
camera.lookAt(scene.position);

const d = 0.3;

dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;

dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 4;

renderer.setClearColor(0x101010, 1);

async function init() {
  const mesh = await load();
  generate(mesh);
  update();
  render();
}

function calcFov(w, h, d) {
  const diag = Math.sqrt(h * h + w * w);
  const fov = 2 * Math.atan(diag / (2 * d)) * (180 / Math.PI);
  return fov;
}

function myResize(w, h, dPR) {
  const s = Math.min(w, h);
  camera.fov = calcFov(s, s, distance);
  camera.updateProjectionMatrix();
  ssao.setSize(w, h, dPR);
  post.setSize(w, h, dPR);
}
addResize(myResize);

window.fov = (fov) => {
  const size = new Vector2();
  renderer.getSize(size);
  console.log(size.x, size.y);
  camera.fov = fov;
  camera.updateProjectionMatrix();
};

resize();
init();

// window.start = () => {
//   frames = 0;
//   window.capturer.start();
// };
