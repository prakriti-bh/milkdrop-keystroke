import * as vscode from 'vscode';

interface EditorActivity {
    intensity: number;
    focus: number;
    chaos: number;
    heat: number;
    cursorFlow: number;
    lastActivity: number;
}

export class VisualizationPanel {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private activity: EditorActivity;
    private activityHistory: number[] = [];
    private cursorPositions: {x: number, y: number, time: number}[] = [];
    private currentPreset = 0;

    constructor(private extensionUri: vscode.Uri) {
        this.panel = vscode.window.createWebviewPanel(
            'milkdropVisualizer',
            'Milkdrop Visualizer',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.activity = {
            intensity: 0,
            focus: 0,
            chaos: 0,
            heat: 0,
            cursorFlow: 0,
            lastActivity: Date.now()
        };

        this.panel.webview.html = this.getWebviewContent();
        this.setupEventListeners();
        this.startActivityAnalysis();

        this.panel.onDidDispose(() => {
            this.dispose();
        });
    }

    private setupEventListeners() {
        // Text changes
        const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                this.analyzeTextChanges(event);
            }
        });

        // Cursor/selection changes
        const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
            this.analyzeCursorMovement(event);
        });

        // Editor focus changes
        const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(() => {
            this.activity.focus = Math.min(this.activity.focus + 0.2, 1.0);
        });

        this.disposables.push(onDidChangeTextDocument, onDidChangeTextEditorSelection, onDidChangeActiveTextEditor);
    }

    private analyzeTextChanges(event: vscode.TextDocumentChangeEvent) {
        const now = Date.now();
        const timeDelta = now - this.activity.lastActivity;
        this.activity.lastActivity = now;

        // Calculate intensity (chars per second)
        let totalChars = 0;
        const linesModified = new Set<number>();
        
        event.contentChanges.forEach(change => {
            totalChars += change.text.length;
            linesModified.add(change.range.start.line);
            
            // Send individual change events
            this.sendVisualizationEvent({
                type: 'keystroke',
                data: {
                    text: change.text,
                    rangeLength: change.rangeLength,
                    line: change.range.start.line,
                    character: change.range.start.character,
                    isInsertion: change.rangeLength === 0,
                    isDeletion: change.text.length === 0
                }
            });
        });

        // Update activity metrics
        this.updateIntensity(totalChars, timeDelta);
        this.activity.chaos = Math.min(this.activity.chaos + event.contentChanges.length * 0.1, 1.0);
        this.activity.heat = Math.min(this.activity.heat + linesModified.size * 0.05, 1.0);

        this.sendActivityUpdate();
    }

    private analyzeCursorMovement(event: vscode.TextEditorSelectionChangeEvent) {
        const selection = event.selections[0];
        const now = Date.now();
        
        const newPos = {
            x: selection.active.character,
            y: selection.active.line,
            time: now
        };

        // Calculate cursor flow (distance traveled)
        if (this.cursorPositions.length > 0) {
            const lastPos = this.cursorPositions[this.cursorPositions.length - 1];
            const distance = Math.sqrt(
                Math.pow(newPos.x - lastPos.x, 2) + Math.pow(newPos.y - lastPos.y, 2)
            );
            const timeDelta = now - lastPos.time;
            
            if (timeDelta > 0) {
                const speed = distance / (timeDelta / 1000); // distance per second
                this.activity.cursorFlow = Math.min(this.activity.cursorFlow + speed * 0.01, 1.0);
            }
        }

        this.cursorPositions.push(newPos);
        if (this.cursorPositions.length > 10) {
            this.cursorPositions.shift();
        }

        this.sendVisualizationEvent({
            type: 'cursor',
            data: {
                line: selection.active.line,
                character: selection.active.character,
                selectionLength: Math.abs(selection.end.character - selection.start.character),
                hasSelection: !selection.isEmpty
            }
        });

        this.sendActivityUpdate();
    }

    private updateIntensity(chars: number, timeDelta: number) {
        if (timeDelta > 0) {
            const charsPerSecond = chars / (timeDelta / 1000);
            this.activityHistory.push(charsPerSecond);
            
            if (this.activityHistory.length > 20) {
                this.activityHistory.shift();
            }
            
            // Smooth intensity calculation
            const avgIntensity = this.activityHistory.reduce((a, b) => a + b, 0) / this.activityHistory.length;
            this.activity.intensity = Math.min(avgIntensity / 10, 1.0); // Normalize to 0-1
        }
    }

    private startActivityAnalysis() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceActivity = now - this.activity.lastActivity;
            
            // Decay activity over time
            if (timeSinceActivity > 1000) {
                this.activity.intensity *= 0.95;
                this.activity.chaos *= 0.98;
                this.activity.heat *= 0.99;
                this.activity.cursorFlow *= 0.97;
            }
            
            // Update focus based on activity
            if (timeSinceActivity < 5000) {
                this.activity.focus = Math.min(this.activity.focus + 0.01, 1.0);
            } else {
                this.activity.focus *= 0.995;
            }
            
            this.sendActivityUpdate();
        }, 100);
    }

    private sendActivityUpdate() {
        this.sendVisualizationEvent({
            type: 'activity',
            data: this.activity
        });
    }

    private sendVisualizationEvent(event: any) {
        this.panel.webview.postMessage(event);
    }

    public nextPreset() {
        this.currentPreset = (this.currentPreset + 1) % 5; // Assuming 5 presets
        this.sendVisualizationEvent({
            type: 'preset',
            data: { preset: this.currentPreset }
        });
    }

    public prevPreset() {
        this.currentPreset = (this.currentPreset - 1 + 5) % 5;
        this.sendVisualizationEvent({
            type: 'preset',
            data: { preset: this.currentPreset }
        });
    }

    private getWebviewContent(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Milkdrop Visualizer</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            overflow: hidden;
            font-family: monospace;
        }
        canvas {
            display: block;
            width: 100vw;
            height: 100vh;
        }
        .info {
            position: absolute;
            top: 10px;
            left: 10px;
            color: rgba(255,255,255,0.7);
            font-size: 12px;
            z-index: 100;
            pointer-events: none;
        }
        .preset-info {
            position: absolute;
            top: 10px;
            right: 10px;
            color: rgba(255,255,255,0.9);
            font-size: 14px;
            z-index: 100;
        }
    </style>
</head>
<body>
    <canvas id="visualizer"></canvas>
    <div class="info">
        <div>Intensity: <span id="intensity">0.0</span></div>
        <div>Focus: <span id="focus">0.0</span></div>
        <div>Chaos: <span id="chaos">0.0</span></div>
        <div>Heat: <span id="heat">0.0</span></div>
        <div>Cursor Flow: <span id="cursorFlow">0.0</span></div>
    </div>
    <div class="preset-info">
        Preset: <span id="presetName">Plasma Storm</span>
    </div>
    
    <script>
        class WebGLMilkdropVisualizer {
            constructor() {
                this.canvas = document.getElementById('visualizer');
                this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
                
                if (!this.gl) {
                    console.error('WebGL not supported');
                    return;
                }
                
                this.width = 0;
                this.height = 0;
                this.time = 0;
                this.currentPreset = 0;
                this.frameCount = 0;
                this.targetFPS = 60;
                this.lastFrameTime = 0;
                
                // Activity parameters
                this.activity = {
                    intensity: 0,
                    focus: 0,
                    chaos: 0,
                    heat: 0,
                    cursorFlow: 0
                };
                
                // Shader presets
                this.presets = [
                    { name: 'Plasma Storm', fragment: this.getPlasmaStormShader() },
                    { name: 'Code Matrix', fragment: this.getCodeMatrixShader() },
                    { name: 'Neural Network', fragment: this.getNeuralNetworkShader() },
                    { name: 'Frequency Waves', fragment: this.getFrequencyWavesShader() },
                    { name: 'Particle Field', fragment: this.getParticleFieldShader() }
                ];
                
                this.resize();
                this.initWebGL();
                this.setupEventListeners();
                this.animate();
            }
            
            resize() {
                this.width = this.canvas.offsetWidth;
                this.height = this.canvas.offsetHeight;
                this.canvas.width = this.width;
                this.canvas.height = this.height;
                
                if (this.gl) {
                    this.gl.viewport(0, 0, this.width, this.height);
                }
            }
            
            initWebGL() {
                // Vertex shader (simple quad)
                const vertexShaderSource = \`
                    attribute vec2 a_position;
                    varying vec2 v_uv;
                    void main() {
                        v_uv = a_position * 0.5 + 0.5;
                        gl_Position = vec4(a_position, 0.0, 1.0);
                    }
                \`;
                
                this.vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
                this.compileCurrentPreset();
                
                // Create quad geometry
                const positions = new Float32Array([
                    -1, -1,  1, -1,  -1, 1,
                    -1, 1,   1, -1,   1, 1
                ]);
                
                this.positionBuffer = this.gl.createBuffer();
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
            }
            
            compileCurrentPreset() {
                const preset = this.presets[this.currentPreset];
                
                if (this.program) {
                    this.gl.deleteProgram(this.program);
                }
                
                const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, preset.fragment);
                this.program = this.createProgram(this.vertexShader, fragmentShader);
                
                // Get uniform locations
                this.uniforms = {
                    time: this.gl.getUniformLocation(this.program, 'u_time'),
                    resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
                    intensity: this.gl.getUniformLocation(this.program, 'u_intensity'),
                    focus: this.gl.getUniformLocation(this.program, 'u_focus'),
                    chaos: this.gl.getUniformLocation(this.program, 'u_chaos'),
                    heat: this.gl.getUniformLocation(this.program, 'u_heat'),
                    cursorFlow: this.gl.getUniformLocation(this.program, 'u_cursor_flow')
                };
                
                document.getElementById('presetName').textContent = preset.name;
            }
            
            createShader(type, source) {
                const shader = this.gl.createShader(type);
                this.gl.shaderSource(shader, source);
                this.gl.compileShader(shader);
                
                if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                    console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
                    this.gl.deleteShader(shader);
                    return null;
                }
                
                return shader;
            }
            
            createProgram(vertexShader, fragmentShader) {
                const program = this.gl.createProgram();
                this.gl.attachShader(program, vertexShader);
                this.gl.attachShader(program, fragmentShader);
                this.gl.linkProgram(program);
                
                if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
                    console.error('Program linking error:', this.gl.getProgramInfoLog(program));
                    this.gl.deleteProgram(program);
                    return null;
                }
                
                return program;
            }
            
            getPlasmaStormShader() {
                return \`
                    precision highp float;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform float u_intensity;
                    uniform float u_focus;
                    uniform float u_chaos;
                    uniform float u_heat;
                    uniform float u_cursor_flow;
                    varying vec2 v_uv;
                    
                    vec3 plasma(vec2 uv) {
                        float x = uv.x;
                        float y = uv.y;
                        float t = u_time * (1.0 + u_intensity);
                        
                        float v1 = sin(x * 10.0 + t * 2.0);
                        float v2 = sin(10.0 * (x * sin(t / 2.0) + y * cos(t / 3.0)) + t);
                        float v3 = sin(sqrt(100.0 * (x*x + y*y) + 1.0) + t);
                        float v4 = sin(x * 5.0 + y * 10.0 + u_chaos * 20.0);
                        
                        float v = (v1 + v2 + v3 + v4) / 4.0;
                        v *= u_focus + 0.5;
                        
                        vec3 color = vec3(
                            sin(v * 3.14159 + u_heat * 2.0),
                            sin(v * 3.14159 + 2.0 + u_cursor_flow * 3.0),
                            sin(v * 3.14159 + 4.0)
                        ) * 0.5 + 0.5;
                        
                        return color * (0.5 + u_intensity);
                    }
                    
                    void main() {
                        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
                        vec3 color = plasma(uv);
                        gl_FragColor = vec4(color, 1.0);
                    }
                \`;
            }
            
            getCodeMatrixShader() {
                return \`
                    precision highp float;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform float u_intensity;
                    uniform float u_focus;
                    uniform float u_chaos;
                    uniform float u_heat;
                    uniform float u_cursor_flow;
                    varying vec2 v_uv;
                    
                    float random(vec2 st) {
                        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                    }
                    
                    void main() {
                        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                        vec2 grid = floor(uv * vec2(40.0, 20.0));
                        
                        float r = random(grid + floor(u_time * (5.0 + u_intensity * 10.0)));
                        float flicker = step(0.7 - u_chaos * 0.3, r);
                        
                        vec3 green = vec3(0.0, 1.0, 0.2);
                        vec3 blue = vec3(0.0, 0.5, 1.0);
                        vec3 red = vec3(1.0, 0.2, 0.0);
                        
                        vec3 color = mix(green, blue, u_focus);
                        color = mix(color, red, u_heat);
                        
                        float trail = 1.0 - fract(uv.y * 10.0 - u_time * (2.0 + u_cursor_flow * 5.0));
                        trail = pow(trail, 3.0);
                        
                        gl_FragColor = vec4(color * flicker * trail * (0.3 + u_intensity), 1.0);
                    }
                \`;
            }
            
            getNeuralNetworkShader() {
                return \`
                    precision highp float;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform float u_intensity;
                    uniform float u_focus;
                    uniform float u_chaos;
                    uniform float u_heat;
                    uniform float u_cursor_flow;
                    varying vec2 v_uv;
                    
                    float noise(vec2 p) {
                        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                    }
                    
                    void main() {
                        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
                        
                        float network = 0.0;
                        for(int i = 0; i < 5; i++) {
                            float fi = float(i);
                            vec2 pos = vec2(sin(u_time * 0.5 + fi), cos(u_time * 0.3 + fi * 2.0)) * 0.5;
                            float dist = length(uv - pos);
                            network += 0.02 / (dist + 0.02) * (u_intensity + 0.1);
                        }
                        
                        // Connection lines
                        float lines = 0.0;
                        for(int i = 0; i < 20; i++) {
                            float fi = float(i);
                            vec2 p1 = vec2(sin(u_time * 0.2 + fi), cos(u_time * 0.15 + fi));
                            vec2 p2 = vec2(sin(u_time * 0.25 + fi + 3.14), cos(u_time * 0.18 + fi + 1.57));
                            
                            vec2 line = p2 - p1;
                            vec2 toPoint = uv - p1;
                            float proj = dot(toPoint, line) / dot(line, line);
                            proj = clamp(proj, 0.0, 1.0);
                            
                            vec2 closest = p1 + proj * line;
                            float lineDist = length(uv - closest);
                            lines += 0.005 / (lineDist + 0.005) * u_cursor_flow;
                        }
                        
                        vec3 color = vec3(0.1, 0.8, 1.0) * network;
                        color += vec3(1.0, 0.4, 0.8) * lines;
                        
                        // Add pulsing based on chaos and heat
                        color *= 1.0 + sin(u_time * 3.0) * u_chaos * 0.3;
                        color = mix(color, vec3(1.0, 0.2, 0.0), u_heat * 0.5);
                        
                        gl_FragColor = vec4(color * (0.5 + u_focus), 1.0);
                    }
                \`;
            }
            
            getFrequencyWavesShader() {
                return \`
                    precision highp float;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform float u_intensity;
                    uniform float u_focus;
                    uniform float u_chaos;
                    uniform float u_heat;
                    uniform float u_cursor_flow;
                    varying vec2 v_uv;
                    
                    void main() {
                        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
                        
                        float waves = 0.0;
                        for(int i = 1; i <= 8; i++) {
                            float fi = float(i);
                            float freq = fi * (1.0 + u_intensity * 2.0);
                            float amp = 1.0 / fi * (u_focus + 0.2);
                            
                            waves += sin(uv.x * freq + u_time * (2.0 + u_cursor_flow * 3.0)) * amp;
                            waves += sin(uv.y * freq * 0.7 + u_time * 1.5 + u_chaos * 5.0) * amp * 0.5;
                        }
                        
                        float pattern = abs(waves);
                        pattern = pow(pattern, 2.0 - u_heat);
                        
                        vec3 color1 = vec3(0.2, 0.8, 1.0);
                        vec3 color2 = vec3(1.0, 0.4, 0.8);
                        vec3 color3 = vec3(1.0, 0.8, 0.2);
                        
                        vec3 color = mix(color1, color2, sin(pattern * 3.14159 + u_time) * 0.5 + 0.5);
                        color = mix(color, color3, u_heat);
                        
                        gl_FragColor = vec4(color * pattern, 1.0);
                    }
                \`;
            }
            
            getParticleFieldShader() {
                return \`
                    precision highp float;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform float u_intensity;
                    uniform float u_focus;
                    uniform float u_chaos;
                    uniform float u_heat;
                    uniform float u_cursor_flow;
                    varying vec2 v_uv;
                    
                    float hash(vec2 p) {
                        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                    }
                    
                    void main() {
                        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
                        vec3 color = vec3(0.0);
                        
                        for(int i = 0; i < 50; i++) {
                            float fi = float(i);
                            vec2 seed = vec2(fi * 0.1, fi * 0.13);
                            
                            vec2 pos = vec2(
                                hash(seed) * 2.0 - 1.0 + sin(u_time * 0.5 + fi * 0.1) * u_cursor_flow,
                                hash(seed + 0.1) * 2.0 - 1.0 + cos(u_time * 0.3 + fi * 0.15) * u_chaos
                            );
                            
                            float dist = length(uv - pos);
                            float size = 0.01 + u_intensity * 0.05;
                            float particle = size / (dist + size);
                            
                            vec3 particleColor = vec3(
                                sin(fi * 0.5 + u_time + u_heat * 3.0) * 0.5 + 0.5,
                                sin(fi * 0.7 + u_time * 1.2) * 0.5 + 0.5,
                                sin(fi * 0.3 + u_time * 0.8 + u_focus * 2.0) * 0.5 + 0.5
                            );
                            
                            color += particleColor * particle;
                        }
                        
                        gl_FragColor = vec4(color, 1.0);
                    }
                \`;
            }
            
            setupEventListeners() {
                window.addEventListener('resize', () => this.resize());
                
                window.addEventListener('message', (event) => {
                    const message = event.data;
                    this.handleVisualizationEvent(message);
                });
            }
            
            handleVisualizationEvent(event) {
                if (event.type === 'activity') {
                    this.activity = event.data;
                    this.updateActivityDisplay();
                } else if (event.type === 'preset') {
                    this.currentPreset = event.data.preset;
                    this.compileCurrentPreset();
                } else if (event.type === 'keystroke') {
                    // Add visual burst for keystrokes
                    this.activity.intensity = Math.min(this.activity.intensity + 0.1, 1.0);
                } else if (event.type === 'cursor') {
                    // Add cursor movement feedback
                    this.activity.cursorFlow = Math.min(this.activity.cursorFlow + 0.05, 1.0);
                }
            }
            
            updateActivityDisplay() {
                document.getElementById('intensity').textContent = this.activity.intensity.toFixed(2);
                document.getElementById('focus').textContent = this.activity.focus.toFixed(2);
                document.getElementById('chaos').textContent = this.activity.chaos.toFixed(2);
                document.getElementById('heat').textContent = this.activity.heat.toFixed(2);
                document.getElementById('cursorFlow').textContent = this.activity.cursorFlow.toFixed(2);
            }
            
            animate(currentTime = 0) {
                // Frame rate control
                const deltaTime = currentTime - this.lastFrameTime;
                const targetFrameTime = 1000 / this.targetFPS;
                
                if (deltaTime >= targetFrameTime) {
                    this.render(currentTime * 0.001);
                    this.lastFrameTime = currentTime - (deltaTime % targetFrameTime);
                    this.frameCount++;
                }
                
                requestAnimationFrame((time) => this.animate(time));
            }
            
            render(time) {
                this.time = time;
                
                // Clear canvas
                this.gl.clearColor(0, 0, 0, 1);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                
                // Use shader program
                this.gl.useProgram(this.program);
                
                // Set uniforms
                this.gl.uniform1f(this.uniforms.time, this.time);
                this.gl.uniform2f(this.uniforms.resolution, this.width, this.height);
                this.gl.uniform1f(this.uniforms.intensity, this.activity.intensity);
                this.gl.uniform1f(this.uniforms.focus, this.activity.focus);
                this.gl.uniform1f(this.uniforms.chaos, this.activity.chaos);
                this.gl.uniform1f(this.uniforms.heat, this.activity.heat);
                this.gl.uniform1f(this.uniforms.cursorFlow, this.activity.cursorFlow);
                
                // Set vertex attributes
                const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
                this.gl.enableVertexAttribArray(positionLocation);
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
                this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
                
                // Draw quad
                this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
            }
        }
        
        // Performance monitoring and optimization
        class PerformanceMonitor {
            constructor(visualizer) {
                this.visualizer = visualizer;
                this.frameTimes = [];
                this.lastCheck = performance.now();
                this.checkInterval = 2000; // Check every 2 seconds
                
                this.startMonitoring();
            }
            
            startMonitoring() {
                setInterval(() => {
                    const now = performance.now();
                    const deltaTime = now - this.lastCheck;
                    const avgFrameTime = deltaTime / this.visualizer.frameCount;
                    const fps = 1000 / avgFrameTime;
                    
                    // Auto-adjust quality based on performance
                    if (fps < this.visualizer.targetFPS * 0.8) {
                        this.reduceQuality();
                    } else if (fps > this.visualizer.targetFPS * 1.1) {
                        this.increaseQuality();
                    }
                    
                    this.lastCheck = now;
                    this.visualizer.frameCount = 0;
                }, this.checkInterval);
            }
            
            reduceQuality() {
                // Reduce shader complexity or resolution if needed
                console.log('Reducing quality for better performance');
            }
            
            increaseQuality() {
                // Increase quality if performance allows
                console.log('Performance good, maintaining quality');
            }
        }
        
        // Initialize the visualizer
        const visualizer = new WebGLMilkdropVisualizer();
        const performanceMonitor = new PerformanceMonitor(visualizer);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                // This would trigger via VS Code command, but we can handle it here too
                visualizer.currentPreset = (visualizer.currentPreset + 1) % visualizer.presets.length;
                visualizer.compileCurrentPreset();
            }
        });
    </script>
</body>
</html>`;
            }

            public dispose() {
                this.panel.dispose();
                this.disposables.forEach(d => d.dispose());
                vscode.commands.executeCommand('setContext', 'milkdropActive', false);
            }
        }