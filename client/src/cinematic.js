import { gsap } from "gsap";
import treeVideo from './assets/tree_video.mp4';

/* ================================================
   PREMIUM CINEMATIC CHERRY BLOSSOM ENGINE
   High-end Video Tree & Infinite Organic Shedding
================================================ */

function getPetalSVG(baseColor) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
          <stop offset="40%" stop-color="${baseColor}" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="${baseColor}" stop-opacity="0.8"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <path d="M12 1.5 C7.5 1.5 3 6 3 10.5 C3 15 12 22.5 12 22.5 C12 22.5 21 15 21 10.5 C21 6 16.5 1.5 12 1.5 Z" fill="url(#grad)" filter="url(#glow)"/>
    </svg>`;
    return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')`;
}

function spawnPetal(container, config) {
    const petal = document.createElement('div');
    const colors = ['#ffb7c5', '#ffd1dc', '#ffffff']; // Added white to match the petals
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    gsap.set(petal, {
        position: 'absolute',
        width: config.size,
        height: config.size,
        background: getPetalSVG(color) + ' no-repeat center/contain',
        opacity: config.opacity !== undefined ? config.opacity : 0,
        x: config.x,
        y: config.y,
        xPercent: -50,
        yPercent: -50,
        filter: `blur(${config.blur || '0px'}) drop-shadow(0 0 ${config.glow ? '6px' : '0px'} ${color})`,
        zIndex: config.zIndex || 1
    });
    
    container.appendChild(petal);
    return petal;
}

export function initializeCinematicIntro() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set('.app-container', { opacity: 1, scale: 1, filter: 'blur(0px)' });
        const overlay = document.getElementById('cinematic-overlay');
        if (overlay) overlay.remove();
        return;
    }

    const overlay = document.getElementById('cinematic-overlay');
    const petalsContainer = document.getElementById('intro-petals');
    const treeLayer = document.getElementById('tree-layer');
    const sparkLayer = document.getElementById('spark-layer');
    const lightningLayer = document.getElementById('lightning-layer');
    const appContainer = document.querySelector('.app-container');
    const cursorGlow = document.getElementById('cursor-glow');

    if (!overlay) return;

    // 1. Cursor Interaction
    if (cursorGlow) {
        cursorGlow.style.background = getPetalSVG('#ffb7c5') + ' no-repeat center/contain';
        cursorGlow.style.borderRadius = '0';
        cursorGlow.style.width = '24px';
        cursorGlow.style.height = '24px';
        cursorGlow.style.filter = 'drop-shadow(0 0 6px #ffb7c5)';
        
        let cursorIdle;
        const xTo = gsap.quickTo(cursorGlow, "left", { duration: 0.4, ease: "power3.out" });
        const yTo = gsap.quickTo(cursorGlow, "top", { duration: 0.4, ease: "power3.out" });
        const rotTo = gsap.quickTo(cursorGlow, "rotation", { duration: 0.8, ease: "power2.out" });
        
        window.addEventListener("mousemove", (e) => {
            xTo(e.clientX);
            yTo(e.clientY);
            
            const dx = e.movementX;
            rotTo(dx * 2);

            gsap.to(cursorGlow, { opacity: 0.4, duration: 0.2 });
            
            clearTimeout(cursorIdle);
            cursorIdle = setTimeout(() => {
                gsap.to(cursorGlow, { opacity: 0, duration: 0.6 });
            }, 300);
        });
    }

    // 2. Black Screen
    const blackScreen = document.createElement('div');
    blackScreen.style.cssText = 'position: absolute; inset: 0; background: #030102; z-index: 100;';
    overlay.insertBefore(blackScreen, overlay.firstChild);

    gsap.set(appContainer, { opacity: 0, scale: 0.9, filter: 'blur(15px)' });
    
    // Inject the video into the tree layer.
    // mix-blend-mode: screen handles the dark background, opacity: 0.5 per instructions
    gsap.set(treeLayer, { display: 'block', opacity: 1, width: '400px', height: '400px', top: '-50px', right: '-50px', x: 0, y: 0, scale: 1, rotation: 0 });
    treeLayer.innerHTML = `<video src="${treeVideo}" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover; mix-blend-mode: screen; opacity: 0.4; pointer-events: none;"></video>`;

    const tl = gsap.timeline();

    // 3. FAST PREMIUM INTRO (1.3s) - No Leader Leaf
    const burstTime = 0.1; 
    
    tl.to(blackScreen, { duration: 0.5, opacity: 0, ease: "power2.inOut" }, burstTime);
    tl.to(appContainer, { duration: 0.5, opacity: 1, scale: 1, filter: 'blur(0px)', ease: "power3.out" }, burstTime);

    // 4. VIDEO TREE ALREADY VISIBLE
    // (Massive shedding begins shortly after)

    // Initial dramatic shed
    for(let i=0; i<60; i++) {
        const depth = Math.random();
        const size = depth > 0.8 ? 20 + Math.random()*15 : 6 + Math.random()*12;
        const blur = depth > 0.8 ? '5px' : (Math.random() > 0.7 ? '2px' : '0px');
        
        const p = spawnPetal(petalsContainer, { size, x: window.innerWidth - (Math.random()*200), y: -20 + Math.random()*150, blur, glow: true, zIndex: depth > 0.8 ? 20 : 5 });
        
        tl.to(p, { duration: 0.3, opacity: 0.8 + Math.random()*0.2 }, burstTime + 1.0 + (i*0.015));
        tl.to(p, { 
            duration: 2.5 + Math.random()*3, 
            x: '-=' + (150 + Math.random()*400), 
            y: window.innerHeight + 100, 
            rotation: (Math.random()>0.5?1:-1) * (180 + Math.random()*500), 
            scale: depth > 0.8 ? 2 : 1,
            opacity: 0, 
            ease: "power1.in" 
        }, burstTime + 1.0 + (i*0.015));
    }

    // 5. START INFINITE SHEDDING & CLEANUP
    const treeAppearCompleteTime = burstTime + 1.5;
    
    // Start infinite shedding right after tree fully appears
    tl.call(() => {
        startInfiniteShedding(petalsContainer);
    }, [], treeAppearCompleteTime);

    // Cleanup intro layers
    tl.call(() => {
        if(blackScreen) blackScreen.remove();
        if(sparkLayer) sparkLayer.remove();
        if(lightningLayer) lightningLayer.remove();
    }, [], treeAppearCompleteTime + 2.0);
}

function startInfiniteShedding(container) {
    setInterval(() => {
        const count = Math.random() > 0.3 ? 3 : 2;
        for (let i = 0; i < count; i++) {
            const size = 6 + Math.random() * 14; 
            const p = spawnPetal(container, { 
                size, 
                x: window.innerWidth - (Math.random()*250), 
                y: -50, 
                blur: Math.random() > 0.7 ? '2px' : '0px', 
                glow: true 
            });
            
            // Fade in gently at top right
            gsap.to(p, { duration: 1.5, opacity: 0.6 + Math.random()*0.4, ease: "power1.out" });
            
            // Fall diagonally downwards and disappear near the bottom
            gsap.to(p, { 
                duration: 4 + Math.random()*4, 
                x: '-=' + (100 + Math.random()*250), 
                y: window.innerHeight + 50, 
                rotation: (Math.random()>0.5?1:-1) * (180 + Math.random()*360), 
                opacity: 0, 
                ease: "power1.in",
                onComplete: () => p.remove()
            });
        }
    }, 400); 
}
