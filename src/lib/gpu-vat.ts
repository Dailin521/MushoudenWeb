export interface VatClip { name: string; duration: number; offset: number; times: number[] }
export interface VatModel {
  vertexCount: number; indexCount: number; textureWidth: number; textureHeight: number;
  bounds: number[]; atlasSize: number[]; premultipliedAlpha: boolean;
  atlasUrl: string; positionsUrl: string; verticesUrl: string; indicesUrl: string; clips: VatClip[];
}

export function decodePositions(packed: Uint8Array, vertexCount: number) {
  const length = packed.length / 2;
  const positions = new Uint16Array(length);
  const stride = vertexCount * 2;
  for (let i = 0; i < length; i++) {
    positions[i] = (packed[i] | packed[i + length] << 8) + (i >= stride ? positions[i - stride] : 0);
  }
  return positions;
}

export function sampleFrames(clip: VatClip, time: number): [number, number, number] {
  let low = 0, high = clip.times.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (clip.times[mid] <= time) low = mid; else high = mid - 1;
  }
  const next = Math.min(low + 1, clip.times.length - 1);
  return [clip.offset + low, clip.offset + next, next === low ? 0 : Math.max(0, Math.min(1, (time - clip.times[low]) / (clip.times[next] - clip.times[low])))];
}

const vertexSource = `#version 300 es
precision highp float;
precision highp usampler2D;
layout(location=0) in vec2 aUv;
layout(location=1) in vec4 aRegion;
layout(location=2) in vec4 aColor;
uniform usampler2D uPositions;
uniform int uTextureWidth;
uniform int uVertexCount;
uniform vec4 uBounds;
uniform vec4 uViewport;
uniform vec3 uFrames;
uniform vec3 uPrevious;
uniform float uTransition;
out vec2 vUv;
out vec4 vRegion;
out vec4 vColor;
vec2 positionAt(int frame) {
  int address = frame * uVertexCount + gl_VertexID;
  uvec2 encoded = texelFetch(uPositions, ivec2(address % uTextureWidth, address / uTextureWidth), 0).rg;
  return uBounds.xy + vec2(encoded) / 65535.0 * uBounds.zw;
}
vec2 pose(vec3 frames) { return mix(positionAt(int(frames.x)), positionAt(int(frames.y)), frames.z); }
void main() {
  vec2 position = mix(pose(uPrevious), pose(uFrames), uTransition);
  gl_Position = vec4((position - uViewport.xy) / uViewport.zw * 2.0 - 1.0, 0.0, 1.0);
  vUv = aUv; vRegion = aRegion; vColor = aColor;
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
uniform bool uPremultiplied;
in vec2 vUv;
in vec4 vRegion;
in vec4 vColor;
out vec4 outColor;
void main() {
  if (any(lessThan(vUv, vRegion.xy)) || any(greaterThan(vUv, vRegion.zw))) discard;
  vec2 halfPixel = 0.5 / uAtlasSize;
  vec4 color = texture(uAtlas, clamp(vUv, vRegion.xy + halfPixel, vRegion.zw - halfPixel));
  if (!uPremultiplied) color.rgb *= color.a;
  outColor = vec4(color.rgb * vColor.rgb * vColor.a, color.a * vColor.a);
}`;

export function createVatRenderer(canvas: HTMLCanvasElement, model: VatModel, positions: Uint16Array,
  vertices: ArrayBuffer, indices: ArrayBuffer, atlas: ImageBitmap) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false });
  if (!gl) throw new Error('WebGL 2 unavailable');
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (Math.max(model.textureWidth, model.textureHeight, ...model.atlasSize) > maxTexture) throw new Error('Texture size unsupported');
  function shader(type: number, source: string) {
    const value = gl!.createShader(type)!;
    gl!.shaderSource(value, source); gl!.compileShader(value);
    if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(value) || 'Shader compilation failed');
    return value;
  }
  const program = gl.createProgram()!;
  const vertex = shader(gl.VERTEX_SHADER, vertexSource), fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
  gl.useProgram(program);
  const uniforms = Object.fromEntries(['uPositions', 'uTextureWidth', 'uVertexCount', 'uBounds', 'uViewport', 'uFrames', 'uPrevious', 'uTransition', 'uAtlas', 'uAtlasSize', 'uPremultiplied'].map(name => [name, gl.getUniformLocation(program, name)]));
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vertexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  for (const [location, size, offset] of [[0, 2, 0], [1, 4, 8], [2, 4, 24]]) {
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 40, offset);
  }
  const indexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const textures = [gl.createTexture(), gl.createTexture()];
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textures[0]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, model.textureWidth, model.textureHeight, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, positions);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[1]);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas); atlas.close();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.uPositions, 0); gl.uniform1i(uniforms.uAtlas, 1);
  gl.uniform1i(uniforms.uTextureWidth, model.textureWidth); gl.uniform1i(uniforms.uVertexCount, model.vertexCount);
  gl.uniform4fv(uniforms.uBounds, model.bounds); gl.uniform2fv(uniforms.uAtlasSize, model.atlasSize);
  gl.uniform1i(uniforms.uPremultiplied, model.premultipliedAlpha ? 1 : 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU resource upload failed');
  return {
    draw(frames: [number, number, number], previous = frames, transition = 1) {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2, 2048 / Math.max(width, height));
      const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const worldHeight = 1440, worldWidth = worldHeight * width / height;
      gl.uniform4f(uniforms.uViewport, 500 - worldWidth, 60, worldWidth, worldHeight);
      gl.uniform3fv(uniforms.uFrames, frames); gl.uniform3fv(uniforms.uPrevious, previous); gl.uniform1f(uniforms.uTransition, transition);
      gl.drawElements(gl.TRIANGLES, model.indexCount, gl.UNSIGNED_SHORT, 0);
    },
    destroy() {
      gl.deleteBuffer(vertexBuffer); gl.deleteBuffer(indexBuffer); gl.deleteVertexArray(vao);
      textures.forEach(texture => gl.deleteTexture(texture)); gl.deleteProgram(program);
    },
  };
}
