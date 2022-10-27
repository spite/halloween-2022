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
  MeshStandardMaterial,
  DynamicDrawUsage,
  Vector2,
  Mesh,
  BoxBufferGeometry,
  MeshNormalMaterial,
  TextureLoader,
} from "../third_party/three.module.js";
import { TAU } from "../modules/Maf.js";
import { GLTFLoader } from "../third_party/GLTFLoader.js";
import { SSAO } from "./SSAO.js";
import { Post } from "./post.js";
// import { capture } from "../modules/capture.js";

const ssao = new SSAO();
const post = new Post(renderer);

const controls = getControls();

const rnd1 = (() => {
  let seed = 1231312;
  const a = 1103515245;
  const c = 12345;
  const m = 2 ** 31;
  return () => {
    seed = (a * seed + c) % m;
    return seed / m;
  };
})();

const rnd2 = (() => {
  let seed = 3459173429;
  return () => {
    seed = 910230123 + seed;
    return (seed % 10000) / 10000;
  };
})();

function chooseRandomGenerator() {
  if (Math.random() > 0.5) {
    console.log("using rnd1");
    return rnd1;
  } else {
    console.log("using rnd2");
    return rnd2;
  }
}

const rnd = chooseRandomGenerator();
function randomInRange(a, b) {
  return a + rnd() * (b - a);
}

// const center = new Mesh(
//   new BoxBufferGeometry(0.01, 0.01, 0.01),
//   new MeshNormalMaterial()
// );
// scene.add(center);

const side = 30;
const poisson = new PoissonSphere3D(side, side, side, 2.5);
const points = poisson.calculate();

const particles = [];
for (const pt of points) {
  const size = randomInRange(0.5, 2.5);
  const rotx = Math.round(randomInRange(0, 10));
  const roty = Math.round(randomInRange(0, 10));
  particles.push({
    position: pt,
    baseRot: randomInRange(0, TAU),
    size,
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
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    const l = a.position.length();
    force.set(0, 0, 0);
    for (let j = 0; j < particles.length; j++) {
      const b = particles[j];
      if (i !== j) {
        dir.copy(a.position).sub(b.position);
        const l = dir.lengthSq();
        const d = a.size + b.size;
        if (l < d ** 2) {
          force.add(dir.divideScalar(l));
        }
      }
    }
    force.normalize().multiplyScalar(0.01);
    a.position.add(force);
    a.position.setLength(l);
  }
}

for (let i = 0; i < 100; i++) {
  relax();
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

    tmp.copy(p.position).multiplyScalar(0.01);
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
  relax();
  if (running) {
    group.rotation.y += 0.001;
    group.rotation.x += 0.0001;
    update();
  }
  ssao.render(renderer, scene, camera);
  post.render(ssao.output);

  // capture(renderer.domElement);

  // if (frames > 5 * 60 && window.capturer.capturing) {
  //   window.capturer.stop();
  //   window.capturer.save();
  // }
  // frames++;

  renderer.setAnimationLoop(render);
}

async function load() {
  const loader = new GLTFLoader();
  return await new Promise((resolve, reject) => {
    // https://sketchfab.com/3d-models/realistic-pumpkin-a3b2b9efdc194d2e84970e099008bc5f
    // Realistic Pumpkin by Styro
    loader.load("realistic_pumpkin.glb", (e) => {
      const mesh =
        e.scene.children[0].children[0].children[0].children[0].children[0];
      // mesh.geometry.scale(0.005, 0.005, 0.005);
      // const mesh = e.scene.children[0].children[0].children[1]; //.children[0].children[0];
      // mesh.geometry.scale(0.15, 0.15, 0.15);
      // debugger;
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
  }
}

let running = true;

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    randomize();
  }
  if (e.code === "Space") {
    running = !running;
  }
});

document.querySelector("#randomizeBtn").addEventListener("click", (e) => {
  randomize();
});

document.querySelector("#pauseBtn").addEventListener("click", (e) => {
  running = !running;
});

renderer.shadowMap.enabled = true;
renderer.outputEncoding = sRGBEncoding;
renderer.shadowMap.type = PCFSoftShadowMap;

const hemiLight = new HemisphereLight(0xe7e9ed, 0x7d828e, 0.75);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const dirLight = new DirectionalLight(0xe0e2e6, 0.5);
dirLight.position.set(-1, 1.75, 1);
scene.add(dirLight);

dirLight.castShadow = true;

dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;

camera.position.set(
  -0.4546147168242088,
  0.34982308172165183,
  0.5576282549706502
);
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

function myResize(w, h, dPR) {
  ssao.setSize(w, h, dPR);
  post.setSize(w, h, dPR);
}
addResize(myResize);

resize();
init();

// window.start = () => {
//   frames = 0;
//   window.capturer.start();
// };
