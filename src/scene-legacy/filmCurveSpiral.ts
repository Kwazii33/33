import * as THREE from 'three';

/**
 * 【旧版 ?v=spiral】生成胶片展开的螺旋样条曲线（平铺在暗房工作台面上）。
 * 从胶片卷出发，阿基米德螺线向外展开，末端留一段直线尾。
 */
export function buildFilmCurve(cardCount: number, pitch: number): THREE.CatmullRomCurve3 {
  const r0 = 1.7; // 螺线起始半径（胶片卷所在）
  const b = 0.62; // 螺线增长系数
  const needed = cardCount * pitch + 8;

  const pts: THREE.Vector3[] = [];
  let theta = 0;
  let prev = new THREE.Vector3(r0, 0, 0);
  let len = 0;
  pts.push(prev.clone());

  while (len < needed && theta < 200) {
    theta += 0.04;
    const r = r0 + b * theta;
    const p = new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r);
    len += p.distanceTo(prev);
    prev = p;
    pts.push(p.clone());
  }

  // 末端直线延伸，让胶片"伸向暗处"
  const dir = prev.clone().sub(pts[pts.length - 2]).normalize();
  for (let i = 1; i <= 6; i++) {
    pts.push(prev.clone().addScaledVector(dir, i * 1.6));
  }

  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.08);
}

export interface CardLayout {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  arcPos: number; // 卡片中心在曲线上的弧长位置
}

/** 沿曲线弧长均布卡片，朝向贴合切线 */
export function layoutCards(
  curve: THREE.CatmullRomCurve3,
  count: number,
  pitch: number,
): CardLayout[] {
  const total = curve.getLength();
  const layouts: CardLayout[] = [];
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < count; i++) {
    const arcPos = pitch * 0.9 + i * pitch + pitch / 2;
    const u = Math.min(arcPos / total, 1);
    const pos = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    // 平躺后绕法线（Y）旋转，使长轴对齐切线
    const yaw = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(tan.x, tan.z));
    const quaternion = yaw.multiply(flat);
    layouts.push({ position: pos, quaternion, arcPos });
  }
  return layouts;
}
