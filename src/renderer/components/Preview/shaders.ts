// 미리보기 WebGL2 셰이더. 최종 렌더(FFmpeg)와 같은 결과가 나오도록 같은 수식을 쓴다.
// - 화면 맞춤: render 의 fitMode (blur/black/fill) 와 같은 배치
// - 색: 클립마다 3D LUT (filters.ts 가 만든 표를 FFmpeg lut3d 와 공유)
// - 전환: FFmpeg xfade 수식 (progress 는 1→0, mix(a,b,m) = a*m + b*(1-m))

export const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // 화면 좌표: 왼쪽 위 (0,0) ~ 오른쪽 아래 (1,1)
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler3D uLutA;
uniform sampler3D uLutB;
uniform bool uHasA;
uniform bool uHasB;
uniform bool uLutOnA;
uniform bool uLutOnB;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform int uFitA;
uniform int uFitB;
uniform vec3 uCropA;
uniform vec3 uCropB;
uniform vec2 uOut;    // 출력 논리 크기 (1920x1080)
uniform int uTrans;    // transitions.ts 의 shader 번호
uniform float uProg;   // xfade progress: 1(시작) → 0(끝)
uniform float uLutSize;

in vec2 vUv;
out vec4 outColor;

float ffmix(float a, float b, float m) { return a * m + b * (1.0 - m); }
vec3 ffmix(vec3 a, vec3 b, float m) { return a * m + b * (1.0 - m); }

// 흐린 배경: 밉맵 + 주변 샘플 평균 (FFmpeg boxblur=20 근사)
vec3 blurSample(sampler2D tex, vec2 uv, vec2 size, float scale) {
  float radiusPx = 26.0 / scale;  // 출력 기준 약 26px 을 원본 픽셀로
  float lod = max(0.0, log2(radiusPx * 0.5));
  vec2 texel = radiusPx / size;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    float r = (i % 2 == 0) ? 0.55 : 1.0;
    sum += textureLod(tex, clamp(uv + vec2(cos(a), sin(a)) * texel * r, 0.0, 1.0), lod).rgb;
  }
  return sum / 12.0;
}

// fit: 0 = 흐린 배경, 1 = 검은 배경, 2 = 꽉 채우기
// crop: 흔들림 줄이기·영역 고정 창 (가운데 x,y, 크기). 렌더의 crop 필터처럼 원본을 먼저 자른 것과 같다
vec3 fitSample(sampler2D tex, vec2 size, int fit, vec2 uv, vec3 crop) {
  vec2 p = uv * uOut;
  float sContain = min(uOut.x / size.x, uOut.y / size.y);
  float sCover = max(uOut.x / size.x, uOut.y / size.y);
  float s = fit == 2 ? sCover : sContain;
  vec2 d = size * s;
  vec2 o = (uOut - d) * 0.5;
  vec2 suv = (p - o) / d;
  bool inside = all(greaterThanEqual(suv, vec2(0.0))) && all(lessThanEqual(suv, vec2(1.0)));
  if (inside) return textureLod(tex, crop.xy + (suv - 0.5) * crop.z, 0.0).rgb;
  if (fit == 1) return vec3(0.0);
  vec2 dc = size * sCover;
  vec2 oc = (uOut - dc) * 0.5;
  return blurSample(tex, crop.xy + ((p - oc) / dc - 0.5) * crop.z, size, sCover / crop.z);
}

vec3 grade(vec3 c, sampler3D lut, bool on) {
  if (!on) return c;
  vec3 coord = c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
  return texture(lut, coord).rgb;
}

vec3 srcA(vec2 uv) {
  if (!uHasA) return vec3(0.0);
  return grade(fitSample(uTexA, uSizeA, uFitA, uv, uCropA), uLutA, uLutOnA);
}
vec3 srcB(vec2 uv) {
  if (!uHasB) return vec3(0.0);
  return grade(fitSample(uTexB, uSizeB, uFitB, uv, uCropB), uLutB, uLutOnB);
}

void main() {
  vec2 uv = vUv;
  float p = uProg;
  vec3 c;
  if (uTrans == 0 || !uHasB) {
    c = srcA(uv);
  } else if (uTrans == 1) { // fade
    c = ffmix(srcA(uv), srcB(uv), p);
  } else if (uTrans == 2 || uTrans == 3) { // fadeblack / fadewhite
    vec3 bg = uTrans == 2 ? vec3(0.0) : vec3(1.0);
    float phase = 0.2;
    c = ffmix(ffmix(srcA(uv), bg, smoothstep(1.0 - phase, 1.0, p)),
              ffmix(bg, srcB(uv), smoothstep(phase, 1.0, p)), p);
  } else if (uTrans == 4) { // slideleft: A 는 왼쪽으로, B 는 오른쪽에서
    float x = uv.x + (1.0 - p);
    c = x < 1.0 ? srcA(vec2(x, uv.y)) : srcB(vec2(x - 1.0, uv.y));
  } else if (uTrans == 5) { // slideright
    float x = uv.x - (1.0 - p);
    c = x >= 0.0 ? srcA(vec2(x, uv.y)) : srcB(vec2(x + 1.0, uv.y));
  } else if (uTrans == 6) { // slideup: A 는 위로, B 는 아래에서
    float y = uv.y + (1.0 - p);
    c = y < 1.0 ? srcA(vec2(uv.x, y)) : srcB(vec2(uv.x, y - 1.0));
  } else if (uTrans == 7) { // circleopen
    float z = length(uOut * 0.5);
    float sm = length(uv * uOut - uOut * 0.5) / z + (p - 0.5) * 3.0;
    c = ffmix(srcA(uv), srcB(uv), smoothstep(0.0, 1.0, sm));
  } else if (uTrans == 8) { // hblur (근사): 가로로 흐려지며 섞임
    float prog = p <= 0.5 ? p * 2.0 : (1.0 - p) * 2.0;
    float size = prog * 0.5;
    vec3 a = vec3(0.0);
    vec3 b = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float dx = (float(i) / 15.0 - 0.5) * size;
      vec2 q = vec2(clamp(uv.x + dx, 0.0, 1.0), uv.y);
      a += srcA(q);
      b += srcB(q);
    }
    c = ffmix(a / 16.0, b / 16.0, p);
  } else if (uTrans == 9) { // zoomin
    float zf = smoothstep(0.5, 1.0, p);
    vec3 a = srcA(0.5 + (uv - 0.5) * zf);
    c = ffmix(a, srcB(uv), smoothstep(0.0, 0.5, p));
  } else {
    c = ffmix(srcA(uv), srcB(uv), p);
  }
  outColor = vec4(c, 1.0);
}`;
