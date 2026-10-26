import { FRAGMENT, VERTEX } from './shaders';

export interface SourceParams {
  width: number;
  height: number;
  /** 0 = 흐린 배경, 1 = 검은 배경, 2 = 꽉 채우기 */
  fit: number;
  lut: boolean;
}

export interface DrawParams {
  a: SourceParams | null;
  b: SourceParams | null;
  /** transitions.ts 의 shader 번호 (0 = 전환 없음) */
  transition: number;
  /** xfade progress 1 → 0 */
  progress: number;
}

export const OUT_W = 1920;
export const OUT_H = 1080;

/** WebGL2 로 미리보기를 그린다. 소스 2개(A/B) + LUT 2개 */
export class GlRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: [WebGLTexture, WebGLTexture];
  private lut: [WebGLTexture, WebGLTexture];
  private lutSize = 33;
  private uni: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 를 쓸 수 없어요');
    this.gl = gl;
    this.prog = link(gl, VERTEX, FRAGMENT);
    gl.useProgram(this.prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const n of [
      'uTexA', 'uTexB', 'uLutA', 'uLutB', 'uHasA', 'uHasB', 'uLutOnA', 'uLutOnB', 'uSizeA', 'uSizeB',
      'uFitA', 'uFitB', 'uOut', 'uTrans', 'uProg', 'uLutSize'
    ]) {
      this.uni[n] = gl.getUniformLocation(this.prog, n);
    }

    this.tex = [this.makeTex2D(), this.makeTex2D()];
    this.lut = [this.makeTex3D(), this.makeTex3D()];
    gl.uniform1i(this.uni.uTexA, 0);
    gl.uniform1i(this.uni.uTexB, 1);
    gl.uniform1i(this.uni.uLutA, 2);
    gl.uniform1i(this.uni.uLutB, 3);
    gl.uniform2f(this.uni.uOut, OUT_W, OUT_H);
  }

  setSize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** 소스 프레임 올리기 (영상 프레임 / 사진) */
  upload(slot: 0 | 1, source: TexImageSource, mipmap: boolean): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** 색 LUT (size³ × RGB, 0~255). null 이면 끔 */
  setLut(slot: 0 | 1, data: Uint8Array, size: number): void {
    const gl = this.gl;
    this.lutSize = size;
    gl.activeTexture(gl.TEXTURE2 + slot);
    gl.bindTexture(gl.TEXTURE_3D, this.lut[slot]);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, size, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
  }

  /** swap: 슬롯 1 을 A 로 (첫 클립이 슬롯 1 에 있을 때) */
  draw(p: DrawParams, swap = false): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    const u = this.uni;
    gl.uniform1i(u.uHasA, p.a ? 1 : 0);
    gl.uniform1i(u.uHasB, p.b ? 1 : 0);
    if (p.a) {
      gl.uniform2f(u.uSizeA, p.a.width, p.a.height);
      gl.uniform1i(u.uFitA, p.a.fit);
      gl.uniform1i(u.uLutOnA, p.a.lut ? 1 : 0);
    }
    if (p.b) {
      gl.uniform2f(u.uSizeB, p.b.width, p.b.height);
      gl.uniform1i(u.uFitB, p.b.fit);
      gl.uniform1i(u.uLutOnB, p.b.lut ? 1 : 0);
    }
    gl.uniform1i(u.uTrans, p.transition);
    gl.uniform1f(u.uProg, p.progress);
    gl.uniform1f(u.uLutSize, this.lutSize);
    for (let i = 0; i < 2; i++) {
      const slot = swap ? 1 - i : i;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
      gl.activeTexture(gl.TEXTURE2 + i);
      gl.bindTexture(gl.TEXTURE_3D, this.lut[slot]);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear(): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private makeTex2D(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }

  private makeTex3D(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 2, 2, 2, 0, gl.RGB, gl.UNSIGNED_BYTE, identityLut(2));
    return t;
  }
}

export function identityLut(size: number): Uint8Array {
  const data = new Uint8Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        data[i++] = Math.round((r / (size - 1)) * 255);
        data[i++] = Math.round((g / (size - 1)) * 255);
        data[i++] = Math.round((b / (size - 1)) * 255);
      }
  return data;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? '셰이더 오류');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? '셰이더 연결 오류');
  return p;
}
