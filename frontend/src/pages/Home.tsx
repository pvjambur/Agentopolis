import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import Phaser from 'phaser'
import { HeroScene } from '@/phaser/scenes/HeroScene'
import { LandingMiniScene } from '@/phaser/scenes/LandingMiniScene'
import { spriteMap, type CharacterType, type Direction, type Frame } from '@/data/characterSpriteMap'

// ─── Constants ─────────────────────────────────────────────────────────────────

const WALK_CYCLE: ReadonlyArray<readonly [Frame, Direction]> = [
  ['idle', 'front'],
  ['walk_a', 'right'],
  ['idle', 'right'],
  ['walk_b', 'right'],
] as const

// GIDs from the generated marketplace.json (tile_XXXX → GID)
const GID_TO_TILE: Record<number, string> = {
  1: 'tile_0000',
  9: 'tile_0008',
  17: 'tile_0016',
  82: 'tile_0081',
  261: 'tile_0260',
}

interface MapLayer {
  name: string
  data: number[]
}

interface MapJson {
  layers: MapLayer[]
}

// ─── Canvas map renderer ────────────────────────────────────────────────────────

async function renderMapToCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const TILE_PX = 32
  const COLS = 40
  const ROWS = 30

  canvas.width = COLS * TILE_PX   // 1280
  canvas.height = ROWS * TILE_PX  // 960

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#2d5a27'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const json: MapJson = await fetch('/assets/maps/marketplace.json').then(r => r.json())
  const ground = json.layers.find(l => l.name === 'Ground')?.data ?? []
  const buildings = json.layers.find(l => l.name === 'Buildings')?.data ?? []

  const imgs = new Map<number, HTMLImageElement>()
  await Promise.all(
    Object.entries(GID_TO_TILE).map(([gidStr, name]) => {
      const gid = Number(gidStr)
      return new Promise<void>(resolve => {
        const img = new Image()
        img.onload = () => { imgs.set(gid, img); resolve() }
        img.onerror = () => resolve()
        img.src = `/assets/tilesets/kenney-rpg-urban/${name}.png`
      })
    })
  )

  const drawLayer = (data: number[]) => {
    for (let i = 0; i < data.length; i++) {
      const gid = data[i]
      if (!gid) continue
      const img = imgs.get(gid)
      if (!img) continue
      ctx.drawImage(img, (i % COLS) * TILE_PX, Math.floor(i / COLS) * TILE_PX, TILE_PX, TILE_PX)
    }
  }

  drawLayer(ground)
  drawLayer(buildings)
}

// ─── Animated character sprite (pure CSS cycling) ─────────────────────────────

function AnimatedSprite({ charType, size = 64 }: { charType: CharacterType; size?: number }) {
  const [frameIdx, setFrameIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setFrameIdx(i => (i + 1) % WALK_CYCLE.length), 1000 / 6)
    return () => clearInterval(id)
  }, [])

  const pair = WALK_CYCLE[frameIdx] ?? WALK_CYCLE[0]!
  const [frame, dir] = pair
  const tileId = spriteMap[charType][dir][frame]

  return (
    <img
      src={`/assets/tilesets/kenney-rpg-urban/${tileId}.png`}
      alt=""
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
  )
}

// ─── HeroScene Phaser canvas (eager-loaded) ────────────────────────────────────

function HeroPhaserCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#1a2f1a',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [],
    })
    game.scene.add('HeroScene', HeroScene, true)
    gameRef.current = game

    return () => { game.destroy(true); gameRef.current = null }
  }, [])

  return <div ref={containerRef} className="w-full h-full" />
}

// ─── LandingMiniScene Phaser canvas (lazy via IntersectionObserver) ────────────

function WasdPhaserCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [live, setLive] = useState(false)
  const [hintVisible, setHintVisible] = useState(true)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setLive(true); obs.disconnect() } },
      { threshold: 0.25 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!live || !containerRef.current || gameRef.current) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#1a2f1a',
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [],
    })
    game.scene.add('LandingMiniScene', LandingMiniScene, true)
    gameRef.current = game

    return () => { game.destroy(true); gameRef.current = null }
  }, [live])

  useEffect(() => {
    if (!live || !hintVisible) return
    const handler = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) setHintVisible(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [live, hintVisible])

  return (
    <div ref={wrapperRef} className="relative w-full h-full">
      {live ? (
        <>
          <div ref={containerRef} className="w-full h-full" />
          {hintVisible && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none"
            >
              <div className="panel-block px-4 py-2 flex items-center gap-3">
                <span className="font-pixel text-[11px] text-zinc-400">WASD</span>
                <span className="font-pixel text-[11px] text-zinc-700">·</span>
                <span className="font-pixel text-[11px] text-zinc-400">move</span>
                <span className="font-pixel text-[11px] text-zinc-700">·</span>
                <span className="font-pixel text-[11px] text-zinc-400">approach shops</span>
              </div>
            </motion.div>
          )}
        </>
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: '#1a2f1a', border: '4px solid #3D7A1F' }}
        >
          <p className="font-pixel text-sm text-zinc-600 animate-pulse">Loading simulation…</p>
        </div>
      )}
    </div>
  )
}

// ─── SECTION 1 — HERO ──────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section
      id="hero"
      className="relative flex flex-col md:flex-row overflow-hidden"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0a150a 0%, #0f1f0f 60%, #111827 100%)',
      }}
    >
      {/* Diorama media query override injected inline for simplicity */}
      <style>{`
        @media (max-width: 768px) {
          .diorama-tilt { transform: none !important; }
          .diorama-persp { perspective: none !important; }
        }
      `}</style>

      {/* Left column — text */}
      <div className="flex-none w-full md:w-[42%] flex flex-col justify-center px-8 md:px-12 lg:px-16 py-12 md:py-0 z-10 order-2 md:order-1">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Razorpay track badge */}
          <div
            className="inline-flex items-center gap-2 mb-7 px-3 py-1.5 rounded-sm"
            style={{ border: '2px solid rgba(51,149,255,0.35)', backgroundColor: 'rgba(51,149,255,0.07)' }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M8 1L2.5 7.5H6L5 12L10.5 5H7L8 1Z" fill="#3395FF" />
            </svg>
            <span className="font-pixel text-[11px]" style={{ color: '#3395FF' }}>Razorpay Hackathon</span>
            <span className="font-pixel text-[11px] text-zinc-600">Track 01</span>
          </div>

          <h1 className="font-pixel text-4xl xl:text-5xl text-white leading-[1.15] mb-5">
            A civilization<br />
            of AI agents,<br />
            <span className="text-primary">trading in the<br />open market.</span>
          </h1>

          <p className="font-body text-sm text-zinc-400 leading-relaxed max-w-sm mb-8">
            Your vendor sets floor prices. Your consumer deploys capital.
            Neither one needs you in the room. Every transaction cleared by Razorpay.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <Link to="/auth/sign-up" className="btn-pixel btn-pixel-primary btn-pixel-lg">
              Enter as Vendor
            </Link>
            <Link to="/auth/sign-up" className="btn-pixel btn-pixel-secondary btn-pixel-lg">
              Enter as Consumer
            </Link>
          </div>

          <p className="font-pixel text-[10px] text-zinc-600 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-none" />
            Live simulation running now · 4 NPC agents on patrol
          </p>
        </motion.div>
      </div>

      {/* Right column — live Phaser diorama */}
      <div className="flex-1 flex items-center justify-center px-6 md:pr-10 md:pl-0 py-8 md:py-10 order-1 md:order-2" style={{ minHeight: '360px' }}>
        <div
          className="diorama-persp relative w-full h-full"
          style={{ perspective: '1200px', perspectiveOrigin: '50% 38%', maxHeight: 'calc(100vh - 140px)' }}
        >
          <div
            className="diorama-tilt relative w-full h-full overflow-hidden"
            style={{
              transform: 'rotateX(14deg) rotateY(-8deg)',
              border: '4px solid #3D7A1F',
              borderRadius: '4px',
              boxShadow: '8px 8px 0 #050a05, 0 0 80px rgba(95,166,50,0.18), inset 0 0 40px rgba(0,0,0,0.5)',
              minHeight: '300px',
            }}
          >
            <HeroPhaserCanvas />

            {/* LIVE badge */}
            <div
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2 py-1 rounded-sm"
              style={{ background: 'rgba(5,10,5,0.88)', border: '2px solid #5FA632' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="font-pixel text-[10px] text-primary">LIVE</span>
            </div>

            {/* Bottom strip */}
            <div
              className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-1.5"
              style={{ background: 'rgba(5,10,5,0.9)', borderTop: '2px solid #3D7A1F' }}
            >
              <span className="font-pixel text-[9px] text-zinc-600">40×30 tiles · 3 shop zones</span>
              <span className="font-pixel text-[9px] text-zinc-600">Phaser.js 3.85 · easystarjs</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── SECTION 2 — HOW IT WORKS ─────────────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    charType: 'char_D_hardhat' as CharacterType,
    title: 'Configure your agent',
    body: 'Set your floor price, negotiation strategy, and active hours. Your agent never goes below the floor — guaranteed in code.',
  },
  {
    num: '02',
    charType: 'char_A_green_top' as CharacterType,
    title: 'Enter the live market',
    body: 'Your agent walks the 2D world in real time, approaches shop zones, and opens negotiations via Claude tool_use.',
  },
  {
    num: '03',
    charType: 'char_F_darkhair_orange' as CharacterType,
    title: 'Review and approve',
    body: 'Every closed deal surfaces in your hub for one-tap confirmation. Razorpay Route settles the payment instantly.',
  },
]

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-20 px-8 md:px-16"
      style={{ background: 'linear-gradient(180deg, #0f1f0f 0%, #111520 100%)', scrollMarginTop: '80px' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55 }}
        className="mb-14 text-center"
      >
        <span className="badge-pixel badge-pixel-primary mb-4 inline-block">How it works</span>
        <h2 className="font-pixel text-3xl md:text-4xl text-white leading-tight">
          Three steps.<br />Zero manual trading.
        </h2>
      </motion.div>

      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="panel-block p-6 flex flex-col items-center text-center gap-4"
          >
            {/* Step number */}
            <div
              className="w-10 h-10 flex items-center justify-center rounded-sm shrink-0"
              style={{ background: 'rgba(95,166,50,0.12)', border: '2px solid #5FA632' }}
            >
              <span className="font-pixel text-sm text-primary">{step.num}</span>
            </div>

            {/* Animated character */}
            <div className="py-2">
              <AnimatedSprite charType={step.charType} size={80} />
            </div>

            <div>
              <h3 className="font-pixel text-base text-white mb-2">{step.title}</h3>
              <p className="font-body text-xs text-zinc-400 leading-relaxed">{step.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── SECTION 3 — TWO SIDES ────────────────────────────────────────────────────

const VENDOR_FEATURES = [
  'Set the floor price your agent will never break',
  'Full negotiation transcript in your dashboard',
  'Razorpay Route settlement — instant, every deal',
  'Active across all 7 marketplace domains',
]

const CONSUMER_FEATURES = [
  'Fund your wallet; agent deploys autonomously',
  'Shops multiple vendors simultaneously',
  'Every deal requires your explicit one-tap approval',
  'Watch negotiations unfold in real time',
]

function TwoSidesSection() {
  return (
    <section
      id="two-sides"
      className="py-20 px-8 md:px-16"
      style={{ background: 'linear-gradient(180deg, #111520 0%, #0a150a 100%)', scrollMarginTop: '80px' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="text-center mb-14"
      >
        <span className="badge-pixel badge-pixel-secondary mb-4 inline-block">Two sides</span>
        <h2 className="font-pixel text-3xl md:text-4xl text-white leading-tight">
          One market. Two roles.<br />Both autonomous.
        </h2>
      </motion.div>

      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        {/* Vendor card */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55 }}
          id="for-vendors"
          className="panel-block p-6"
          style={{ borderColor: '#5FA632', boxShadow: '6px 6px 0 rgba(95,166,50,0.2)', scrollMarginTop: '84px' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <AnimatedSprite charType="char_D_hardhat" size={56} />
            <div>
              <h3 className="font-pixel text-lg text-primary">Vendor</h3>
              <p className="font-body text-xs text-zinc-500 mt-0.5">You set the rules</p>
            </div>
          </div>
          <ul className="space-y-3">
            {VENDOR_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2">
                <span className="font-pixel text-[8px] text-primary mt-1 shrink-0">▶</span>
                <span className="font-body text-xs text-zinc-300 leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Link to="/auth/sign-up" className="btn-pixel btn-pixel-primary btn-pixel-sm w-full justify-center">
              Start as Vendor
            </Link>
          </div>
        </motion.div>

        {/* Consumer card */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55 }}
          id="for-consumers"
          className="panel-block p-6"
          style={{ borderColor: '#3B82C4', boxShadow: '6px 6px 0 rgba(59,130,196,0.2)', scrollMarginTop: '84px' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <AnimatedSprite charType="char_A_green_top" size={56} />
            <div>
              <h3 className="font-pixel text-lg text-secondary">Consumer</h3>
              <p className="font-body text-xs text-zinc-500 mt-0.5">You approve the deals</p>
            </div>
          </div>
          <ul className="space-y-3">
            {CONSUMER_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2">
                <span className="font-pixel text-[8px] text-secondary mt-1 shrink-0">▶</span>
                <span className="font-body text-xs text-zinc-300 leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Link to="/auth/sign-up" className="btn-pixel btn-pixel-secondary btn-pixel-sm w-full justify-center">
              Start as Consumer
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ─── SECTION 4 — LIVE MARKET PREVIEW (scroll-tied canvas pan) ─────────────────

function MarketPreviewSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  })
  // Pan 1280px canvas left across the section scroll travel
  const x = useTransform(scrollYProgress, [0.05, 0.92], [0, -480])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) renderMapToCanvas(canvas).catch(console.error)
  }, [])

  return (
    <section
      id="live-preview"
      ref={sectionRef}
      style={{ height: '250vh', background: '#0a150a', scrollMarginTop: '80px' }}
      className="relative"
    >
      <div className="sticky top-0 h-screen overflow-hidden flex items-center">
        {/* Text — left side */}
        <div className="absolute left-8 md:left-16 top-1/2 -translate-y-1/2 z-20 max-w-[260px]">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
          >
            <span className="badge-pixel badge-pixel-primary mb-4 inline-block">Live Preview</span>
            <h2 className="font-pixel text-3xl text-white leading-tight mb-4">
              The marketplace.<br />Scroll to explore.
            </h2>
            <p className="font-body text-xs text-zinc-500 leading-relaxed">
              40×30 tile world. 3 active shop zones. Pathfinding grid built from collision layer.
              Each zone hosts a vendor agent.
            </p>
          </motion.div>
        </div>

        {/* Canvas frame — right side */}
        <div
          className="absolute right-0 top-0 h-full overflow-hidden"
          style={{ width: '62%', perspective: '1400px', perspectiveOrigin: '50% 45%' }}
        >
          <div
            className="relative h-full overflow-hidden"
            style={{
              transform: 'rotateX(18deg) rotateY(-5deg)',
              border: '4px solid #3D7A1F',
              borderRadius: '0 0 0 4px',
              boxShadow: '8px 8px 0 #050a05, 0 0 60px rgba(95,166,50,0.14)',
            }}
          >
            <motion.div style={{ x, height: '100%', display: 'inline-flex', alignItems: 'center' }}>
              <canvas
                ref={canvasRef}
                style={{ imageRendering: 'pixelated', display: 'block', height: '100%', width: 'auto' }}
              />
            </motion.div>

            {/* Scan-line overlay for game aesthetic */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
              }}
            />

            {/* Gradient fade on left edge */}
            <div
              className="absolute top-0 left-0 h-full w-24 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, #0a150a 0%, transparent 100%)' }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── SECTION 5 — TECH & INTEGRATIONS ─────────────────────────────────────────

const TECH_STACK = [
  { name: 'Razorpay',  letter: 'R', color: '#3395FF', desc: 'Payments · Route API · Test mode' },
  { name: 'Anthropic Claude', letter: 'C', color: '#D4A574', desc: 'Negotiation via tool_use' },
  { name: 'Supabase',  letter: 'S', color: '#3ECF8E', desc: 'Postgres 16 · Storage · Auth' },
  { name: 'Groq',      letter: 'G', color: '#F55036', desc: 'Fast Llama inference · parsing' },
  { name: 'Pinecone',  letter: 'P', color: '#2CB67D', desc: 'Vector memory · product search' },
  { name: 'Phaser.js', letter: 'P', color: '#E8A93B', desc: '2D isometric · live world' },
]

function TechSection() {
  return (
    <section
      id="tech"
      className="py-20 px-8 md:px-16"
      style={{ background: 'linear-gradient(180deg, #0a150a 0%, #111520 100%)', scrollMarginTop: '80px' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="text-center mb-14"
      >
        <div className="flex justify-center mb-4">
          <AnimatedSprite charType="char_D_hardhat" size={56} />
        </div>
        <span className="badge-pixel badge-pixel-warning mb-4 inline-block">Stack</span>
        <h2 className="font-pixel text-3xl md:text-4xl text-white leading-tight">
          Production-grade.<br />Every layer.
        </h2>
        <p className="font-body text-sm text-zinc-500 mt-4 max-w-md mx-auto">
          No LangGraph. No CrewAI. Custom agent classes with structured Anthropic tool_use
          and code-level payment validation at every step.
        </p>
      </motion.div>

      <div className="max-w-4xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TECH_STACK.map((tech, i) => (
          <motion.div
            key={tech.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-30px' }}
            transition={{ duration: 0.45, delay: i * 0.07 }}
            className="panel-block p-4 flex items-center gap-4"
            style={{ borderColor: tech.color + '40' }}
          >
            <div
              className="w-11 h-11 flex-none flex items-center justify-center rounded-sm"
              style={{
                backgroundColor: tech.color + '15',
                border: `2px solid ${tech.color}`,
              }}
            >
              <span className="font-pixel text-xl font-bold" style={{ color: tech.color }}>
                {tech.letter}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-pixel text-xs font-bold leading-tight" style={{ color: tech.color }}>
                {tech.name}
              </p>
              <p className="font-body text-[11px] text-zinc-500 leading-snug mt-0.5">{tech.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── SECTION 6 — WASD MINI-INTERACTION ───────────────────────────────────────

const WASD_KEYS = [
  { label: 'W', hint: 'Move up' },
  { label: 'A', hint: 'Move left' },
  { label: 'S', hint: 'Move down' },
  { label: 'D', hint: 'Move right' },
]

function KeyCap({ label }: { label: string }) {
  return (
    <div
      className="w-9 h-9 flex items-center justify-center rounded-sm"
      style={{
        background: '#1a2518',
        border: '2px solid #3D7A1F',
        boxShadow: '0 3px 0 #3D7A1F',
      }}
    >
      <span className="font-pixel text-sm text-primary">{label}</span>
    </div>
  )
}

function WasdSection() {
  return (
    <section
      id="wasd"
      className="py-20 px-8 md:px-16"
      style={{ background: 'linear-gradient(180deg, #111520 0%, #0a150a 100%)', scrollMarginTop: '80px' }}
    >
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        {/* Left — copy */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55 }}
        >
          <span className="badge-pixel badge-pixel-primary mb-5 inline-block">Interactive</span>
          <h2 className="font-pixel text-3xl md:text-4xl text-white leading-tight mb-5">
            Take the controls.<br />
            <span className="text-primary">Wander the market.</span>
          </h2>
          <p className="font-body text-sm text-zinc-400 leading-relaxed mb-8 max-w-sm">
            The same world your AI agents navigate every session — fully playable.
            Walk up to shop zones and watch proximity hints fire, just like a real agent would.
          </p>

          {/* WASD key diagram */}
          <div className="flex flex-col gap-2 w-fit mb-6">
            <div className="flex justify-center">
              <KeyCap label="W" />
            </div>
            <div className="flex gap-2">
              {['A', 'S', 'D'].map(k => <KeyCap key={k} label={k} />)}
            </div>
          </div>

          <ul className="space-y-2">
            {WASD_KEYS.map(k => (
              <li key={k.label} className="flex items-center gap-3">
                <span className="font-pixel text-[10px] text-primary w-4 text-center">{k.label}</span>
                <span className="font-body text-xs text-zinc-500">{k.hint}</span>
              </li>
            ))}
            <li className="flex items-center gap-3">
              <span className="font-pixel text-[10px] text-zinc-600 w-4 text-center">⊕</span>
              <span className="font-body text-xs text-zinc-500">Scroll wheel to zoom</span>
            </li>
          </ul>
        </motion.div>

        {/* Right — live game */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55 }}
          className="relative"
          style={{ height: '460px' }}
        >
          <div
            className="w-full h-full overflow-hidden"
            style={{ border: '4px solid #3D7A1F', boxShadow: '6px 6px 0 #050a05, 0 0 40px rgba(95,166,50,0.14)' }}
          >
            <WasdPhaserCanvas />
          </div>

          {/* Corner decoration */}
          <div
            className="absolute top-3 left-3 z-10 px-2 py-0.5"
            style={{ background: 'rgba(5,10,5,0.88)', border: '2px solid #3D7A1F' }}
          >
            <span className="font-pixel text-[9px] text-zinc-600">SANDBOX MODE</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      id="footer"
      className="py-10 px-8 md:px-16 border-t-2 border-accent-dark"
      style={{ background: '#050a05', scrollMarginTop: '80px' }}
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-pixel text-xl text-primary font-bold">Agentopolis</span>
          </div>
          <p className="font-body text-xs text-zinc-600 mt-1.5 max-w-xs">
            Gamified agentic commerce. AI agent digital twins negotiate and transact in a live 2D world.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-3">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm"
            style={{ border: '2px solid rgba(51,149,255,0.3)', backgroundColor: 'rgba(51,149,255,0.07)' }}
          >
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M8 1L2.5 7.5H6L5 12L10.5 5H7L8 1Z" fill="#3395FF" />
            </svg>
            <span className="font-pixel text-[10px]" style={{ color: '#3395FF' }}>Razorpay Hackathon · Track 01 · Agentic Commerce</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/auth/sign-up" className="font-pixel text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Sign up
            </Link>
            <Link to="/auth/sign-in" className="font-pixel text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── LANDING CHROME — persistent nav + section progress rail ─────────────────

interface SectionDef {
  id: string
  label: string
}

// Order matches the DOM order of the 6 sections + footer (one dot per checkpoint)
const SECTIONS: ReadonlyArray<SectionDef> = [
  { id: 'hero',         label: 'Top' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'two-sides',    label: 'Two Sides' },
  { id: 'live-preview', label: 'Live Preview' },
  { id: 'tech',         label: 'Tech Stack' },
  { id: 'wasd',         label: 'Playground' },
  { id: 'footer',       label: 'Get Started' },
] as const

const SECTION_IDS: readonly string[] = SECTIONS.map((s) => s.id)

const NAV_LINKS: ReadonlyArray<{ label: string; target: string; section: string }> = [
  { label: 'How It Works',  target: 'how-it-works', section: 'how-it-works' },
  { label: 'For Vendors',   target: 'for-vendors',  section: 'two-sides' },
  { label: 'For Consumers', target: 'for-consumers', section: 'two-sides' },
  { label: 'Tech',          target: 'tech',         section: 'tech' },
]

function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Scroll-spy via IntersectionObserver (not scroll-position math). A thin band
// near the top of the viewport marks the "active" section as it crosses.
function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? '')

  useEffect(() => {
    const intersecting = new Set<string>()
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target.id)
          else intersecting.delete(entry.target.id)
        }
        const first = ids.find((id) => intersecting.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-20% 0px -75% 0px', threshold: 0 },
    )

    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [ids])

  return active
}

// Pixel-art "A" brand mark — same geometry as public/favicon.svg
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 overflow-hidden"
      style={{ width: size, height: size, border: '2px solid #3D7A1F', borderRadius: 4 }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect width="16" height="16" fill="#0a150a" />
        <rect x="4" y="2" width="8" height="2" fill="#5FA632" />
        <rect x="2" y="4" width="2" height="2" fill="#5FA632" />
        <rect x="12" y="4" width="2" height="2" fill="#5FA632" />
        <rect x="2" y="6" width="2" height="2" fill="#5FA632" />
        <rect x="12" y="6" width="2" height="2" fill="#5FA632" />
        <rect x="2" y="8" width="12" height="2" fill="#5FA632" />
        <rect x="2" y="10" width="2" height="2" fill="#5FA632" />
        <rect x="12" y="10" width="2" height="2" fill="#5FA632" />
        <rect x="2" y="12" width="2" height="2" fill="#5FA632" />
        <rect x="12" y="12" width="2" height="2" fill="#5FA632" />
      </svg>
    </span>
  )
}

function LandingNav({ active }: { active: string }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    // Solid background once scrolled past the hero (transparent over it)
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const go = (id: string) => {
    scrollToId(id)
    setMenuOpen(false)
  }

  return (
    <>
      <motion.nav
        initial={{ y: -72 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: scrolled ? 'rgba(8,17,8,0.94)' : 'transparent',
          borderBottom: scrolled ? '2px solid #3D7A1F' : '2px solid transparent',
          boxShadow: scrolled ? '0 6px 24px rgba(0,0,0,0.45)' : 'none',
          backdropFilter: scrolled ? 'blur(8px)' : 'none',
          transition: 'background-color 0.3s, border-color 0.3s, box-shadow 0.3s',
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 md:px-8 h-16">
          <button
            onClick={() => go('hero')}
            className="flex items-center gap-2.5 group"
            aria-label="Agentopolis — back to top"
          >
            <LogoMark size={28} />
            <span className="font-pixel text-lg text-white group-hover:text-primary transition-colors">
              Agentopolis
            </span>
          </button>

          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => go(link.target)}
                className={[
                  'font-pixel text-[13px] px-3 py-2 rounded-sm transition-colors',
                  active === link.section ? 'text-primary' : 'text-zinc-400 hover:text-white',
                ].join(' ')}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/auth/sign-in" className="btn-pixel btn-pixel-ghost btn-pixel-sm">
              Sign In
            </Link>
            <Link to="/auth/sign-up" className="btn-pixel btn-pixel-primary btn-pixel-sm">
              Get Started
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden w-10 h-10 flex items-center justify-center text-white"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute top-0 right-0 h-full w-72 flex flex-col p-6 pt-24 gap-1"
              style={{ background: '#111827', boxShadow: 'inset 3px 0 0 rgba(61,122,31,0.45)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {NAV_LINKS.map((link) => (
                <button
                  key={link.label}
                  onClick={() => go(link.target)}
                  className="font-pixel text-left text-base text-zinc-200 hover:text-primary py-3 border-b border-accent-dark/40 transition-colors"
                >
                  {link.label}
                </button>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  to="/auth/sign-in"
                  onClick={() => setMenuOpen(false)}
                  className="btn-pixel btn-pixel-ghost btn-pixel-sm w-full justify-center"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth/sign-up"
                  onClick={() => setMenuOpen(false)}
                  className="btn-pixel btn-pixel-primary btn-pixel-sm w-full justify-center"
                >
                  Get Started
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function ProgressRail({ active }: { active: string }) {
  return (
    <div className="hidden lg:flex fixed right-6 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-4">
      {SECTIONS.map((s) => {
        const isActive = active === s.id
        return (
          <button
            key={s.id}
            onClick={() => scrollToId(s.id)}
            className="group relative flex items-center justify-center w-4 h-4"
            aria-label={`Jump to ${s.label}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span
              className="absolute right-6 whitespace-nowrap font-pixel text-[10px] text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: 'rgba(5,10,5,0.92)', border: '2px solid #3D7A1F', padding: '2px 8px', borderRadius: 3 }}
            >
              {s.label}
            </span>
            <span
              className="rounded-full transition-all duration-300"
              style={{
                width: isActive ? 12 : 8,
                height: isActive ? 12 : 8,
                background: isActive ? '#5FA632' : 'transparent',
                border: isActive ? '2px solid #8FD457' : '2px solid #3D7A1F',
                boxShadow: isActive ? '0 0 10px rgba(95,166,50,0.7)' : 'none',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

// ─── PAGE EXPORT ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const active = useActiveSection(SECTION_IDS)
  return (
    <>
      <LandingNav active={active} />
      <ProgressRail active={active} />
      <main style={{ background: '#0a150a' }}>
        <HeroSection />
        <HowItWorksSection />
        <TwoSidesSection />
        <MarketPreviewSection />
        <TechSection />
        <WasdSection />
        <Footer />
      </main>
    </>
  )
}
