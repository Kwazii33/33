import * as THREE from 'three';
import type { ArchiveEntry } from '@/data/archive';

const W = 448;
const H = 672;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** 无图条目：排字底片版（暗房文字档案） */
function drawTypePlate(ctx: CanvasRenderingContext2D, entry: ArchiveEntry, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#100e0b';
  ctx.fillRect(x, y, w, h);

  // 微弱的红光晕染
  const g = ctx.createRadialGradient(x + w * 0.3, y + h * 0.22, 10, x + w * 0.3, y + h * 0.22, w * 1.1);
  g.addColorStop(0, 'rgba(255,110,40,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(232,224,208,0.92)';
  ctx.textAlign = 'left';
  ctx.font = "600 64px 'SimSun', 'Songti SC', serif";
  ctx.fillText(entry.id, x + 28, y + 92);

  ctx.font = "24px 'SimSun', 'Songti SC', serif";
  ctx.fillStyle = 'rgba(232,224,208,0.85)';
  const title = entry.title.replace(/《|》/g, '');
  ctx.fillText(title.length > 11 ? title.slice(0, 11) : title, x + 28, y + 140);

  ctx.font = "18px 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = 'rgba(255,150,80,0.75)';
  ctx.fillText(`文学档案 · 无底片`, x + 28, y + h - 88);

  // 档案章
  ctx.strokeStyle = 'rgba(255,120,50,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + w - 62, y + h - 88, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "13px 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = 'rgba(255,120,50,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText('TEXT', x + w - 62, y + h - 92);
  ctx.fillText('ONLY', x + w - 62, y + h - 76);
  ctx.restore();
}

/** 合成整张底片卡贴图：胶片齿孔 + 照片 + 手写标注 */
export async function buildCardTexture(
  entry: ArchiveEntry,
  index: number,
): Promise<THREE.CanvasTexture> {
  let img: HTMLImageElement | null = null;
  if (entry.image) {
    try {
      img = await loadImage(entry.image);
    } catch {
      img = null;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 片基
  ctx.fillStyle = '#17140f';
  ctx.fillRect(0, 0, W, H);

  // 齿孔
  ctx.fillStyle = '#2b2620';
  for (let y = 20; y < H - 30; y += 56) {
    roundRect(ctx, 14, y, 18, 26, 5);
    ctx.fill();
    roundRect(ctx, W - 32, y, 18, 26, 5);
    ctx.fill();
  }

  // 照片区
  const px = 50, py = 44, pw = W - 100, ph = 500;
  if (img) {
    drawCover(ctx, img, px, py, pw, ph);
  } else {
    drawTypePlate(ctx, entry, px, py, pw, ph);
  }

  // 照片暗角
  const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.32, px + pw / 2, py + ph / 2, ph * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(px, py, pw, ph);

  // 底部手写标注条
  ctx.textAlign = 'left';
  ctx.font = "22px 'Kaiti SC', 'KaiTi', 'STKaiti', serif";
  ctx.fillStyle = 'rgba(226,218,200,0.95)';
  const label = `${entry.id} · ${entry.year}`;
  ctx.fillText(label, px, py + ph + 44);
  const short = entry.artist.split(' / ')[0];
  ctx.font = "20px 'Kaiti SC', 'KaiTi', 'STKaiti', serif";
  ctx.fillStyle = 'rgba(226,218,200,0.62)';
  ctx.fillText(short.length > 14 ? short.slice(0, 14) + '…' : short, px, py + ph + 80);

  // 右上角序号
  ctx.textAlign = 'right';
  ctx.font = "600 26px 'Courier New', monospace";
  ctx.fillStyle = entry.importance === '高' ? 'rgba(255,140,60,0.95)' : 'rgba(226,218,200,0.5)';
  ctx.fillText(`Nº ${String(index + 1).padStart(2, '0')}`, px + pw, py + ph + 46);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
