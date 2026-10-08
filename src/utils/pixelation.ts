import { transparentColorData } from './pixelEditingUtils';

// 定义像素化模式
export enum PixelationMode {
  Dominant = 'dominant', // 卡通模式（主色）
  Average = 'average',   // 真实模式（平均色）
}

// 定义色号系统类型
export type ColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

// --- 必要的类型定义 ---
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface OklabColor {
  l: number;
  a: number;
  b: number;
}

export type PaletteToneBias = 'none' | 'warm';

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
}

// --- 辅助函数 ---

// 转换 Hex 到 RGB
export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function rgbToOklab(rgb: RgbColor): OklabColor {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
  };
}

const oklabCache = new Map<string, OklabColor>();

function getOklabColor(rgb: RgbColor): OklabColor {
  const cacheKey = `${rgb.r},${rgb.g},${rgb.b}`;
  const cached = oklabCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const oklab = rgbToOklab(rgb);
  oklabCache.set(cacheKey, oklab);
  return oklab;
}

// 使用 Oklab 空间计算颜色距离，并保持与现有 0-100 阈值输入兼容。
export function colorDistance(rgb1: RgbColor, rgb2: RgbColor): number {
  const oklab1 = getOklabColor(rgb1);
  const oklab2 = getOklabColor(rgb2);

  const dl = oklab1.l - oklab2.l;
  const da = oklab1.a - oklab2.a;
  const db = oklab1.b - oklab2.b;

  return Math.sqrt(dl * dl + da * da + db * db) * 100;
}

const WARM_GREEN_MATCH_PENALTY = 5;
const WARM_OR_NEUTRAL_A_MIN = -0.004;
const NON_BLUE_B_MIN = -0.01;
const MIN_VISIBLE_CHROMA = 0.008;
// Image compression and lighting can add a small green cast to an otherwise
// gray cell, so the source threshold is intentionally wider than the palette
// threshold used to identify truly neutral bead colors.
const NEUTRAL_SOURCE_MAX_CHROMA = 0.035;
const NEUTRAL_SOURCE_MAX_CHANNEL_SPREAD = 24;
const NEUTRAL_PALETTE_MAX_CHROMA = 0.018;
const NEUTRAL_PALETTE_MAX_CHANNEL_SPREAD = 20;
const GREEN_HUE_MIN = 115;
const GREEN_HUE_MAX = 200;
const COOL_HUE_MAX = 260;

const TONE_ANALYSIS_MIN_CHROMA = 0.015;
const TONE_ANALYSIS_MAX_LIGHTNESS = 0.985;
const TONE_ANALYSIS_MIN_WEIGHT = 0.25;
const WARM_TONE_MIN_SHARE = 0.75;
const WARM_TONE_MAX_COOL_SHARE = 0.05;
const WARM_TONE_COOL_MATCH_PENALTY = 4;
const WARM_TONE_HUE_SHIFT_WEIGHT = 1;

function getChroma(lab: OklabColor): number {
  return Math.hypot(lab.a, lab.b);
}

function getHue(lab: OklabColor): number {
  const hue = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  return hue < 0 ? hue + 360 : hue;
}

function getRgbChannelSpread(rgb: RgbColor): number {
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
}

function isHueInRange(lab: OklabColor, minHue: number, maxHue: number): boolean {
  if (getChroma(lab) < MIN_VISIBLE_CHROMA) return false;
  const hue = getHue(lab);
  return lab.a < 0 && hue >= minHue && hue <= maxHue;
}

function isGreenHue(lab: OklabColor): boolean {
  return isHueInRange(lab, GREEN_HUE_MIN, GREEN_HUE_MAX);
}

function isCoolHue(lab: OklabColor): boolean {
  return isHueInRange(lab, GREEN_HUE_MIN, COOL_HUE_MAX);
}

function isWarmOrNeutral(lab: OklabColor): boolean {
  return lab.a >= WARM_OR_NEUTRAL_A_MIN && lab.b >= NON_BLUE_B_MIN;
}

function isNeutralSourceColor(rgb: RgbColor): boolean {
  const lab = getOklabColor(rgb);
  return getChroma(lab) <= NEUTRAL_SOURCE_MAX_CHROMA
    && getRgbChannelSpread(rgb) <= NEUTRAL_SOURCE_MAX_CHANNEL_SPREAD;
}

function isNeutralPaletteColor(rgb: RgbColor): boolean {
  const lab = getOklabColor(rgb);
  return getChroma(lab) <= NEUTRAL_PALETTE_MAX_CHROMA
    && getRgbChannelSpread(rgb) <= NEUTRAL_PALETTE_MAX_CHANNEL_SPREAD;
}

function isNonGreenNeutral(lab: OklabColor): boolean {
  return getChroma(lab) <= NEUTRAL_SOURCE_MAX_CHROMA && !isGreenHue(lab);
}

/**
 * Near-neutral warm and green shades can have a small total Oklab distance
 * even when their tint is visibly opposite. Keep that hue direction intact
 * without affecting blue/purple shades or genuinely green source colors.
 */
export function hasWarmGreenHueConflict(rgb1: RgbColor, rgb2: RgbColor): boolean {
  const lab1 = getOklabColor(rgb1);
  const lab2 = getOklabColor(rgb2);

  return (
    ((isWarmOrNeutral(lab1) || isNonGreenNeutral(lab1)) && isGreenHue(lab2))
    || (isGreenHue(lab1) && (isWarmOrNeutral(lab2) || isNonGreenNeutral(lab2)))
  );
}

/**
 * Detect a strongly warm image with almost no meaningful green/cool content.
 * Near-white and near-neutral cells do not vote because their hue is unstable.
 */
export function inferPaletteToneBias(colors: Array<RgbColor | null>): PaletteToneBias {
  let totalChromaWeight = 0;
  let warmChromaWeight = 0;
  let coolChromaWeight = 0;

  colors.forEach(color => {
    if (!color) return;

    const lab = getOklabColor(color);
    const chroma = getChroma(lab);
    if (chroma < TONE_ANALYSIS_MIN_CHROMA || lab.l > TONE_ANALYSIS_MAX_LIGHTNESS) {
      return;
    }

    totalChromaWeight += chroma;
    if (lab.a >= 0 && lab.b >= -0.02) {
      warmChromaWeight += chroma;
    }
    if (isCoolHue(lab)) {
      coolChromaWeight += chroma;
    }
  });

  if (totalChromaWeight < TONE_ANALYSIS_MIN_WEIGHT) return 'none';

  const warmShare = warmChromaWeight / totalChromaWeight;
  const coolShare = coolChromaWeight / totalChromaWeight;
  return warmShare >= WARM_TONE_MIN_SHARE && coolShare <= WARM_TONE_MAX_COOL_SHARE
    ? 'warm'
    : 'none';
}

function getWarmTonePenalty(targetLab: OklabColor, paletteLab: OklabColor): number {
  // Keep genuinely blue source details cool even inside an otherwise warm image.
  if (targetLab.b < NON_BLUE_B_MIN) return 0;

  const coolHuePenalty = isCoolHue(paletteLab) ? WARM_TONE_COOL_MATCH_PENALTY : 0;
  const introducedGreen = Math.max(0, targetLab.a - paletteLab.a);
  const introducedBlue = Math.max(0, targetLab.b - paletteLab.b);
  return coolHuePenalty + (
    introducedGreen + introducedBlue
  ) * 100 * WARM_TONE_HUE_SHIFT_WEIGHT;
}

function paletteMatchDistance(
  targetRgb: RgbColor,
  paletteRgb: RgbColor,
  toneBias: PaletteToneBias
): number {
  const perceptualDistance = colorDistance(targetRgb, paletteRgb);
  let adjustedDistance = perceptualDistance + (
    hasWarmGreenHueConflict(targetRgb, paletteRgb) ? WARM_GREEN_MATCH_PENALTY : 0
  );

  if (toneBias === 'warm') {
    adjustedDistance += getWarmTonePenalty(
      getOklabColor(targetRgb),
      getOklabColor(paletteRgb)
    );
  }

  return adjustedDistance;
}

// 查找最接近的颜色
export function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[],
  toneBias: PaletteToneBias = 'none'
): PaletteColor {
  if (!palette || palette.length === 0) {
      console.error("findClosestPaletteColor: Palette is empty or invalid!");
      // 提供一个健壮的回退
      return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  const neutralCandidates = isNeutralSourceColor(targetRgb)
    ? palette.filter(paletteColor => {
        const paletteLab = getOklabColor(paletteColor.rgb);
        return isNeutralPaletteColor(paletteColor.rgb) && !isGreenHue(paletteLab);
      })
    : [];
  const candidatePalette = neutralCandidates.length > 0 ? neutralCandidates : palette;

  let minDistance = Infinity;
  let closestColor = candidatePalette[0];

  for (const paletteColor of candidatePalette) {
    const distance = paletteMatchDistance(targetRgb, paletteColor.rgb, toneBias);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
    if (distance === 0) break; // 完全匹配，提前退出
  }
  return closestColor;
}


// --- 核心像素化计算逻辑 ---

/**
 * 计算图像指定区域的代表色（根据所选模式）
 * @param imageData 包含像素数据的 ImageData 对象
 * @param startX 区域起始 X 坐标
 * @param startY 区域起始 Y 坐标
 * @param width 区域宽度
 * @param height 区域高度
 * @param mode 计算模式 ('dominant' 或 'average')
 * @returns 代表色的 RGB 对象，或 null（如果区域无效或全透明）
 */
function calculateCellRepresentativeColor(
    imageData: ImageData,
    startX: number,
    startY: number,
    width: number,
    height: number,
    mode: PixelationMode
): RgbColor | null {
    const data = imageData.data;
    const imgWidth = imageData.width;
    let rSum = 0, gSum = 0, bSum = 0;
    let pixelCount = 0;
    const colorCountsInCell: { [key: string]: number } = {};
    let dominantColorRgb: RgbColor | null = null;
    let maxCount = 0;

    const endX = startX + width;
    const endY = startY + height;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = (y * imgWidth + x) * 4;
            // 检查 alpha 通道，忽略完全透明的像素
            if (data[index + 3] < 128) continue;

            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];

            pixelCount++;

            if (mode === PixelationMode.Average) {
                rSum += r;
                gSum += g;
                bSum += b;
            } else { // Dominant mode
                const colorKey = `${r},${g},${b}`;
                colorCountsInCell[colorKey] = (colorCountsInCell[colorKey] || 0) + 1;
                if (colorCountsInCell[colorKey] > maxCount) {
                    maxCount = colorCountsInCell[colorKey];
                    dominantColorRgb = { r, g, b };
                }
            }
        }
    }

    if (pixelCount === 0) {
        return null; // 区域内没有不透明像素
    }

    if (mode === PixelationMode.Average) {
        return {
            r: Math.round(rSum / pixelCount),
            g: Math.round(gSum / pixelCount),
            b: Math.round(bSum / pixelCount),
        };
    } else { // Dominant mode
        return dominantColorRgb; // 可能为 null 如果只有一个透明像素
    }
}

/**
 * 根据原始图像数据、网格尺寸、调色板和模式计算像素化网格数据。
 * @param originalCtx 原始图像的 Canvas 2D Context
 * @param imgWidth 原始图像宽度
 * @param imgHeight 原始图像高度
 * @param N 网格横向数量
 * @param M 网格纵向数量
 * @param palette 当前使用的调色板
 * @param mode 像素化模式 (Dominant/Average)
 * @param t1FallbackColor T1 或其他备用颜色数据
 * @returns 计算后的 MappedPixel 网格数据
 */
export function calculatePixelGrid(
    originalCtx: CanvasRenderingContext2D,
    imgWidth: number,
    imgHeight: number,
    N: number,
    M: number,
    palette: PaletteColor[],
    mode: PixelationMode,
    t1FallbackColor: PaletteColor // 传入备用色
): MappedPixel[][] {
    console.log(`Calculating pixel grid with mode: ${mode}`);
    const mappedData: MappedPixel[][] = Array(M).fill(null).map(() => Array(N).fill({ key: t1FallbackColor.key, color: t1FallbackColor.hex }));
    const cellWidthOriginal = imgWidth / N;
    const cellHeightOriginal = imgHeight / M;

    let fullImageData: ImageData | null = null;
    try {
        fullImageData = originalCtx.getImageData(0, 0, imgWidth, imgHeight);
    } catch (e) {
        console.error("Failed to get full image data:", e);
        // 如果无法获取图像数据，返回一个空的或默认的网格
        return mappedData;
    }

    const representativeColors: Array<Array<RgbColor | null>> = Array(M)
      .fill(null)
      .map(() => Array(N).fill(null));

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const startXOriginal = Math.floor(i * cellWidthOriginal);
            const startYOriginal = Math.floor(j * cellHeightOriginal);
            // 计算精确的单元格结束位置，避免超出图像边界
            const endXOriginal = Math.min(imgWidth, Math.ceil((i + 1) * cellWidthOriginal));
            const endYOriginal = Math.min(imgHeight, Math.ceil((j + 1) * cellHeightOriginal));
            // 计算实际的单元格宽高
            const currentCellWidth = Math.max(1, endXOriginal - startXOriginal);
            const currentCellHeight = Math.max(1, endYOriginal - startYOriginal);

            // 使用提取的函数计算代表色
            const representativeRgb = calculateCellRepresentativeColor(
                fullImageData,
                startXOriginal,
                startYOriginal,
                currentCellWidth,
                currentCellHeight,
                mode
            );

            representativeColors[j][i] = representativeRgb;
        }
    }

    const toneBias = inferPaletteToneBias(representativeColors.flat());
    console.log(`Detected palette tone bias: ${toneBias}`);

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const representativeRgb = representativeColors[j][i];
            let finalCellColorData: MappedPixel;
            if (representativeRgb) {
                const closestBead = findClosestPaletteColor(representativeRgb, palette, toneBias);
                finalCellColorData = { key: closestBead.key, color: closestBead.hex };
            } else {
                // 如果单元格为空或全透明，标记为透明/外部
                finalCellColorData = { ...transparentColorData };
            }
            mappedData[j][i] = finalCellColorData;
        }
    }
    console.log(`Pixel grid calculation complete for mode: ${mode}`);
    return mappedData;
} 
