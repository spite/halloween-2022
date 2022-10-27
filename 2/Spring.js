import { Vector3 } from "../third_party/three.module.js";

class Spring {
  constructor(p1, p2, restLength = 1, stiffness = 1) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = restLength;
    this.stiffness = stiffness;

    this.delta = new Vector3();
  }

  apply() {
    this.delta.copy(this.p1.position).sub(this.p2.position);
    const dist = this.delta.length() + 0.0000001;
    const force =
      (((dist - this.restLength) /
        (dist * (this.p1._massInv + this.p2._massInv))) *
        this.stiffness) /
      10000;

    if (!this.p1.fixed) {
      this.p1.position.add(
        this.delta.clone().multiplyScalar(force * this.p1._massInv)
      );
    }

    if (!this.p2.fixed) {
      this.p2.position.add(
        this.delta.multiplyScalar(-force * this.p2._massInv)
      );
    }
  }
}

export { Spring };
