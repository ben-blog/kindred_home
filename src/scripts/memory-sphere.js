/**
 * Lazy memory sphere. The call page owns the data; this file only draws it.
 * Layout and accent come from the character, not from a name.
 */
export async function mountSphere(root, call, options) {
  const reduced = options.reduced === true;
  let THREE;
  try {
    THREE = await import('three');
  } catch {
    return null;
  }

  const accent = safeColor(options.accent, '#ffffff');
  const layout = options.layout === 'void' ? 'void' : 'board';
  const width = root.clientWidth || 160;
  const height = root.clientHeight || 160;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  root.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 20);
  camera.position.z = 3.15;
  const rig = new THREE.Group();
  scene.add(rig);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
    })
  );
  rig.add(shell);

  const dot = glowTexture(THREE);
  const material = new THREE.PointsMaterial({
    size: layout === 'void' ? 0.05 : 0.06,
    map: dot,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  let pointsMesh = null;
  let lineMesh = null;
  let records = [];
  let version = '';
  let focusId = '';
  let retrieved = new Set();
  let frame = 0;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.09;
  const pointer = new THREE.Vector2(2, 2);
  const label = document.createElement('p');
  label.className = 'call-memory-label';
  label.hidden = true;
  root.append(label);

  function rebuild(next, nextVersion) {
    const previous = new Map(records.map((item) => [item.id, item]));
    const moved = version !== '' && nextVersion !== version;
    version = nextVersion;
    records = next.map((point) => {
      const prior = previous.get(point.id);
      const target = new THREE.Vector3(point.x, point.y, point.z).normalize();
      const shown = prior
        ? prior.shown.clone()
        : target.clone().multiplyScalar(moved || reduced ? 1 : 2.5);
      if (moved && prior) shown.copy(prior.shown);
      return { ...point, target, shown, color: kindColor(THREE, accent, point.kind, layout) };
    });
    if (pointsMesh) rig.remove(pointsMesh);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(records.length * 3), 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(records.length * 3), 3)
    );
    pointsMesh = new THREE.Points(geometry, material);
    material.size = pointSize(records.length, layout);
    rig.add(pointsMesh);
    writeBuffers(1);
  }

  function writeBuffers(glow) {
    if (!pointsMesh) return;
    const position = pointsMesh.geometry.attributes.position;
    const color = pointsMesh.geometry.attributes.color;
    records.forEach((record, index) => {
      position.setXYZ(index, record.shown.x, record.shown.y, record.shown.z);
      const tint = record.color.clone();
      if (retrieved.has(record.id)) tint.lerp(new THREE.Color('#ffffff'), 0.35 + 0.65 * glow);
      if (record.id === focusId) tint.lerp(new THREE.Color('#ffffff'), 0.8);
      color.setXYZ(index, tint.r, tint.g, tint.b);
    });
    position.needsUpdate = true;
    color.needsUpdate = true;
  }

  function drawLines() {
    if (lineMesh) {
      rig.remove(lineMesh);
      lineMesh.geometry.dispose();
    }
    const chosen = records.filter((record) => retrieved.has(record.id));
    if (!chosen.length) {
      lineMesh = null;
      return;
    }
    const positions = new Float32Array(chosen.length * 6);
    chosen.forEach((record, index) => {
      positions.set([record.shown.x, record.shown.y, record.shown.z, 0, 0, 0], index * 6);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineMesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: accent,
        transparent: true,
        opacity: layout === 'void' ? 0.28 : 0.4,
      })
    );
    rig.add(lineMesh);
  }

  function hit() {
    if (!pointsMesh || pointer.x > 1) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(pointsMesh);
    if (!hits.length) return null;
    return records[hits[0].index] || null;
  }

  function showLabel(record) {
    if (!record) {
      label.hidden = true;
      return;
    }
    label.hidden = false;
    label.textContent = record.label || record.kind;
  }

  renderer.domElement.addEventListener('pointermove', (event) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    const record = hit();
    showLabel(record);
    call?.dispatchEvent(new CustomEvent('memory-hover', { detail: { id: record?.id || '' } }));
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    pointer.set(2, 2);
    if (!focusId) showLabel(null);
  });
  renderer.domElement.addEventListener('click', () => {
    const record = hit();
    focusId = record?.id || '';
    showLabel(record);
  });

  const observer = new ResizeObserver(() => {
    const nextWidth = root.clientWidth || 160;
    const nextHeight = root.clientHeight || 160;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
  });
  observer.observe(root);

  let stopped = false;
  function animate() {
    if (stopped) return;
    frame = requestAnimationFrame(animate);
    records.forEach((record) => record.shown.lerp(record.target, reduced ? 1 : 0.08));
    if (!reduced) rig.rotation.y += 0.0024;
    const glow = reduced ? 1 : 0.65 + Math.sin(performance.now() / 280) * 0.35;
    writeBuffers(glow);
    if (lineMesh) {
      const position = lineMesh.geometry.attributes.position;
      records
        .filter((record) => retrieved.has(record.id))
        .forEach((record, index) => {
          position.setXYZ(index, record.shown.x, record.shown.y, record.shown.z);
        });
      position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  animate();

  return {
    setMap(detail) {
      const points = (Array.isArray(detail?.points) ? detail.points : []).filter(
        (point) => point && point.kind !== 'reflection'
      );
      const nextVersion = detail?.basisFingerprint
        ? String(detail.basisFingerprint)
        : detail?.basisVersion == null
          ? ''
          : String(detail.basisVersion);
      if (detail?.reset || (version && nextVersion && nextVersion !== version)) {
        records = [];
        version = '';
      }
      rebuild(points, nextVersion);
    },
    showRetrieved(items) {
      retrieved = new Set(
        (items || [])
          .filter((item) => item && item.id && item.kind !== 'reflection')
          .map((item) => item.id)
      );
      drawLines();
    },
    focus(id) {
      focusId = id || '';
      const record = records.find((item) => item.id === focusId);
      showLabel(record || null);
    },
  };
}

function safeColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value : fallback;
}

function kindColor(THREE, accent, kind, layout) {
  const color = new THREE.Color(kind === 'album_moment' ? '#FF6B4A' : accent);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (kind === 'album_moment') {
    if (layout === 'void') {
      hsl.s = 0.62;
      hsl.l = 0.72;
    } else {
      hsl.s = 0.78;
      hsl.l = 0.58;
    }
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
  }
  const hash = [...String(kind)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  hsl.h = (hsl.h + (hash % 6) * 0.07) % 1;
  if (layout === 'void') {
    hsl.s = Math.min(hsl.s, 0.45);
    hsl.l = 0.84;
  } else {
    hsl.l = Math.min(0.62, Math.max(0.42, hsl.l));
  }
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function pointSize(count, layout) {
  const base = layout === 'void' ? 0.058 : 0.062;
  const scale = Math.min(1, 16 / Math.sqrt(Math.max(count, 1)));
  return base * Math.max(0.35, scale);
}

function glowTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
