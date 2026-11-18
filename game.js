'use strict'

const byId = id => document.getElementById(id)
const scene = byId('scene')
const ctx = scene.getContext('2d')
const video = byId('camera')
const toggle = byId('toggle')
const share = byId('share')
const status = byId('status')
const demo = new Image()
demo.src = 'bed.jpg'

const width = scene.width
let height = scene.height
const demoTrack = { left: 44, right: 856, y: 0 }
const probe = document.createElement('canvas')
probe.width = 120
probe.height = 80
const scan = probe.getContext('2d', { willReadFrequently: true })
const stars = [.22, .48, .64, .80]
const mushroomX = .36
const mushroomHeight = 104
const gravity = 1650
const sprite = [
  '.....WWWW.....', '....WBBBBWW...', '....NSSSSN....', '....NSSNSN....',
  '.....SSSS.....', '...BBBBBBB....', '..BBWBBWWBB...', '..SSBBBBBSS...',
  '....NNNNN.....', '....NN.NN.....', '...NN...NN....', '..WW.....WW...'
]
const colors = { N: '#152244', B: '#285acf', S: '#f1b283', R: '#285acf', W: '#fff6de' }

let stream, track = demoTrack, state = 'ready', requesting = false
let candidate, stable = 0, lastScan = 0, lastTime = 0
let run, snapshot, resultToken = 0
const scale = () => Math.min(1.2, height / 560)

function resize() {
  if (state === 'finish') return
  height = Math.round(width * scene.clientHeight / Math.max(1, scene.clientWidth))
  scene.height = height
  demoTrack.y = height * .68
  if (stream && state !== 'running') {
    state = 'scan'
    stable = 0
    candidate = null
  }
}
window.addEventListener('resize', () => { if (state !== 'running') resize() })
resize()

function cover(target, source, sw, sh) {
  const ratio = source === demo ? width / sw : Math.max(width / sw, height / sh)
  const w = sw * ratio, h = sh * ratio
  target.drawImage(source, (width - w) / 2, source === demo ? demoTrack.y - h * .599 : (height - h) / 2, w, h)
}

function detectBed() {
  scan.drawImage(scene, 0, 0, 120, 80)
  const data = scan.getImageData(0, 0, 120, 80).data
  const luminance = (x, y) => {
    const p = (y * 120 + x) * 4
    return .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2]
  }
  let best
  for (let y = 34; y < 72; y++) {
    let left = null, holes = 0
    for (let x = 6; x <= 114; x++) {
      const p = (y * 120 + x) * 4
      const bright = luminance(x, y)
      const neutral = Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) < 43
      const edge = bright > 135 && neutral && bright - luminance(x, y + 4) > 17
      if (edge && x < 114) {
        left ??= x
        holes = 0
      } else if (left !== null && (++holes > 4 || x === 114)) {
        const right = x - holes
        const span = right - left
        if (span >= 55 && (!best || span > best.span)) best = { left, right, y, span }
        left = null
      }
    }
  }
  if (!best) {
    stable = 0
    candidate = null
    return
  }
  if (candidate && Math.abs(candidate.y - best.y) < 4 &&
      Math.abs(candidate.left - best.left) < 8 && Math.abs(candidate.right - best.right) < 8) stable++
  else stable = 1
  candidate = best
  if (stable < 4) return
  track = { left: best.left * 7.5, right: best.right * 7.5, y: (best.y - 5) * height / probe.height }
  start()
}

function refresh(message) {
  toggle.hidden = requesting || !['ready', 'scan'].includes(state)
  share.hidden = state !== 'finish' || !snapshot
  if (message) status.textContent = message
}

function stopCamera() {
  stream?.getTracks().forEach(item => item.stop())
  stream = null
  video.srcObject = null
}

async function openCamera() {
  if (requesting || state === 'running' || state === 'finish') return
  if (!navigator.mediaDevices?.getUserMedia) {
    refresh('相机需要安全连接，点按画面可以用参考床试跑。')
    return
  }
  requesting = true
  refresh()
  let opened
  try {
    opened = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
    if (state !== 'ready') { opened.getTracks().forEach(item => item.stop()); return }
    video.srcObject = opened
    await video.play()
    if (state !== 'ready') { opened.getTracks().forEach(item => item.stop()); video.srcObject = null; return }
    stream = opened
    state = 'scan'
    stable = 0
    candidate = null
    refresh('请将床的侧面放进取景框。')
  } catch {
    opened?.getTracks().forEach(item => item.stop())
    video.srcObject = null
    refresh('无法开启相机，点按画面可以用参考床试跑。')
  } finally {
    requesting = false
    refresh()
  }
}

toggle.onclick = () => {
  if (!stream) { openCamera(); return }
  stopCamera()
  track = demoTrack
  state = 'ready'
  refresh('点按画面开始试跑。')
}

function jump() {
  if (state !== 'running') return
  run.jumpBuffer = .10
}

function start() {
  snapshot = null
  resultToken++
  byId('score').textContent = '0000'
  run = { x: .04, z: 0, velocity: 0, jumpBuffer: 0, score: 0, collected: new Set(), clock: 0, big: false }
  state = 'running'
  refresh('点按画面跳跃。')
}

function press() {
  if (state === 'ready') start()
  else jump()
}

scene.addEventListener('pointerdown', press)
scene.addEventListener('keydown', event => {
  if (event.code !== 'Space' && event.code !== 'Enter') return
  event.preventDefault()
  if (!event.repeat) press()
})

const trackX = x => track.left + (track.right - track.left) * x
const trackY = x => track.y + ((track.endY ?? track.y) - track.y) * x
const flagX = .93

function tick(dt) {
  run.clock += dt
  run.x += dt * (run.big ? .249 : .208)
  if (!run.z && run.jumpBuffer > 0) {
    run.velocity = run.big ? 555 : 465
    run.jumpBuffer = 0
  }
  run.jumpBuffer = Math.max(0, run.jumpBuffer - dt)
  if (run.velocity || run.z) {
    run.z = Math.max(0, run.z + run.velocity * dt)
    run.velocity = run.z ? run.velocity - gravity * dt : 0
  }
  const head = run.z + 60
  const trackSpan = track.right - track.left
  const overlapsMushroom = Math.abs(run.x - mushroomX) * trackSpan < 32 * scale()
  if (!run.big && overlapsMushroom && run.velocity > 0 && head >= mushroomHeight) {
    run.big = true
    run.score += 150
    run.grewAt = run.clock
  }
  stars.forEach((x, index) => {
    if (!run.collected.has(index) && Math.abs(run.x - x) < .028 && run.z > 29) {
      run.collected.add(index)
      run.score += 100
    }
  })
  if (Math.abs(run.x - flagX) < .025 && run.z > 22) {
    run.x = flagX - 22 / (track.right - track.left)
    run.caught = true
    run.score += 300 + Math.round(run.z * 7 / 10) * 10
    finish()
  } else if (run.x >= .98) finish()
  byId('score').textContent = String(run.score).padStart(4, '0')
}

function finish() {
  state = 'finish'
  refresh('正在生成截图。')
}

function athlete(x, y, moving) {
  const growth = run?.big ? 1 + .6 * Math.min(1, (run.clock - run.grewAt) / .10) : 1
  const size = 5 * growth * scale()
  const step = moving && Math.floor(run.clock * 20) % 2 ? 3 : 0
  sprite.forEach((row, j) => [...row].forEach((pixel, i) => {
    if (!colors[pixel]) return
    ctx.fillStyle = colors[pixel]
    ctx.fillRect(Math.round(x + (i - 7) * size + (j > 8 ? (i < 7 ? step : -step) : 0)), Math.round(y + (j - sprite.length) * size), size, size)
  }))
}

function star(x, y) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI * i / 5 - Math.PI / 2
    const r = i % 2 ? 6 : 13
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
  }
  ctx.closePath()
  ctx.fillStyle = '#ffce58'
  ctx.strokeStyle = '#955019'
  ctx.lineWidth = 2
  ctx.fill()
  ctx.stroke()
}

function mushroom(x, y) {
  const unit = 4 * scale()
  ctx.save()
  ctx.translate(x - 4 * unit, y - 7 * unit)
  ctx.scale(unit, unit)
  ctx.fillStyle = '#602235'
  ctx.fillRect(0, 2, 8, 4)
  ctx.fillRect(2, 0, 4, 7)
  ctx.fillStyle = '#ed5566'
  ctx.fillRect(1, 2, 6, 3)
  ctx.fillRect(2, 1, 4, 2)
  ctx.fillStyle = '#fff3df'
  ctx.fillRect(2, 2, 1, 2)
  ctx.fillRect(5, 1, 1, 2)
  ctx.fillRect(3, 5, 2, 2)
  ctx.restore()
}

function guide() {
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.setLineDash([12, 9])
  ctx.shadowColor = '#111627'
  ctx.shadowBlur = 6
  ctx.strokeRect(45, height * .42, 810, height * .47)
  ctx.shadowBlur = 0
  ctx.setLineDash([])
}

function render() {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  if (stream && video.readyState >= 2) cover(ctx, video, video.videoWidth, video.videoHeight)
  else if (!stream && demo.naturalWidth) cover(ctx, demo, demo.naturalWidth, demo.naturalHeight)
  if (state === 'scan') return
  const x = trackX(flagX), y = trackY(flagX)
  const size = scale()
  const pennantY = run?.caught ? trackY(run.x) - run.z * size - (run.big ? 65 : 40) * size : y - 115 * size
  ctx.fillStyle = '#162745'
  ctx.fillRect(x - 3 * size, y - 130 * size, 6 * size, 131 * size)
  ctx.fillStyle = '#f6c349'
  ctx.fillRect(x - 6 * size, y - 135 * size, 12 * size, 10 * size)
  ctx.fillStyle = '#3472d9'
  ctx.fillRect(x - 53 * size, pennantY, 50 * size, 27 * size)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x - 46 * size, pennantY + 10 * size, 30 * size, 4 * size)
  stars.forEach((s, i) => {
    if (!run?.collected.has(i)) star(trackX(s), trackY(s) - 73 * size)
  })
  if (!run?.big) mushroom(trackX(mushroomX), trackY(mushroomX) - mushroomHeight * size)
  const pos = run?.x ?? .04
  const floor = trackY(pos)
  ctx.fillStyle = '#1a24484a'
  ctx.beginPath()
  ctx.ellipse(trackX(pos), floor + 2, 25, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  athlete(trackX(pos), floor - (run?.z ?? 0) * size, state === 'running' && !run.z)
  if (run?.caught) {
    ctx.fillStyle = colors.R
    ctx.fillRect(x - 13 * size, pennantY + 6 * size, 9 * size, 8 * size)
    ctx.fillStyle = colors.S
    ctx.fillRect(x - 6 * size, pennantY + 2 * size, 7 * size, 7 * size)
  }
}

function capture() {
  const card = document.createElement('canvas')
  card.width = width
  card.height = height
  const paint = card.getContext('2d')
  paint.drawImage(scene, 0, 0)
  paint.fillStyle = '#102344'
  const logo = byId('logo')
  if (logo.complete && logo.naturalWidth) {
    const bounds = logo.getBoundingClientRect()
    const pixels = width / scene.clientWidth
    paint.drawImage(logo, bounds.left * pixels, bounds.top * pixels, bounds.width * pixels, bounds.height * pixels)
  }
  paint.textAlign = 'right'
  paint.font = '800 31px monospace'
  paint.fillText(String(run.score).padStart(4, '0'), width - 30, 64)
  stopCamera()
  const token = ++resultToken
  card.toBlob(blob => {
    if (token !== resultToken || state !== 'finish') return
    snapshot = blob && new File([blob], 'airweave-instagram.jpg', { type: 'image/jpeg' })
    refresh(snapshot ? '完赛画面已定格。可分享或保存截图。' : '截图生成失败，请重新试跑。')
  }, 'image/jpeg', .92)
}

function download() {
  const url = URL.createObjectURL(snapshot)
  const link = document.createElement('a')
  link.href = url
  link.download = snapshot.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

share.onclick = async () => {
  if (!snapshot) return
  const payload = { files: [snapshot] }
  if (!navigator.canShare?.(payload)) {
    download()
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
    return
  }
  try { await navigator.share(payload) }
  catch (error) {
    if (error.name !== 'AbortError') download()
  }
}

function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, .045)
  lastTime = time
  if (state !== 'finish') {
    const wasRunning = state === 'running'
    if (wasRunning) tick(dt)
    render()
    if (state === 'scan' && video.readyState >= 2 && time - lastScan > 180) {
      lastScan = time
      detectBed()
    }
    if (state === 'scan') guide()
    if (wasRunning && state === 'finish') capture()
  }
  requestAnimationFrame(frame)
}
refresh()
requestAnimationFrame(frame)
if (navigator.permissions?.query) {
  navigator.permissions.query({ name: 'camera' }).then(permission => {
    if (permission.state !== 'denied') openCamera()
  }).catch(() => openCamera())
} else openCamera()
