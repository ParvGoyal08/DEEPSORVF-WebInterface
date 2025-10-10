class VesselTracker {
    constructor() {
        this.bboxData = null;
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('overlay');
        this.ctx = this.canvas.getContext('2d');
        this.visibility = {}; // Track visibility state for each vessel ID
        this.currentFrame = 0;
        this.originalSize = [1920, 1080];
        this.displaySize = [500, 281];
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadBboxData();
            this.setupEventListeners();
            this.updateStatus('Ready - Click on vessels to toggle AIS info');
        } catch (error) {
            this.updateStatus('Error loading data: ' + error.message);
            console.error('Initialization error:', error);
        }
    }
    
    async loadBboxData() {
        const response = await fetch('/result/video/bbox_data.json?v=' + Date.now());
        if (!response.ok) {
            throw new Error(`Failed to load bbox data: ${response.status}`);
        }
        this.bboxData = await response.json();
        this.originalSize = this.bboxData.original_size;
        this.displaySize = this.bboxData.display_size;
        
        // Update canvas size to match video display size
        this.canvas.width = this.displaySize[0];
        this.canvas.height = this.displaySize[1];
        
        // Set canvas CSS size to match video element
        this.canvas.style.width = this.displaySize[0] + 'px';
        this.canvas.style.height = this.displaySize[1] + 'px';
        
        // Initially disable canvas interaction (video starts paused)
        this.canvas.style.pointerEvents = 'none';
        
        console.log(`Loaded ${this.bboxData.frames.length} frames`);
    }
    
    setupEventListeners() {
        // Video time update - sync with frame data
        this.video.addEventListener('timeupdate', () => {
            this.updateFrameFromTime();
        });
        
        // Video play/pause events - toggle canvas interactivity
        this.video.addEventListener('play', () => {
            this.canvas.style.pointerEvents = 'auto';
            console.log('Canvas enabled for vessel interaction');
        });
        
        this.video.addEventListener('pause', () => {
            this.canvas.style.pointerEvents = 'none';
            console.log('Canvas disabled - video controls active');
        });
        
        // Canvas click handling
        this.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
        
        // Control buttons
        document.getElementById('show-all').addEventListener('click', () => {
            this.showAllVessels();
        });
        
        document.getElementById('hide-all').addEventListener('click', () => {
            this.hideAllVessels();
        });
    }
    
    updateFrameFromTime() {
        if (!this.bboxData) return;
        
        const currentTime = this.video.currentTime;
        const fps = this.bboxData.fps;
        const frameNumber = Math.floor(currentTime * fps);
        
        if (frameNumber !== this.currentFrame && frameNumber < this.bboxData.frames.length) {
            this.currentFrame = frameNumber;
            this.drawCurrentFrame();
            this.updateFrameInfo();
        }
    }
    
    updateFrameInfo() {
        const frame = this.bboxData.frames[this.currentFrame];
        if (frame) {
            document.getElementById('frame-info').textContent = this.currentFrame;
            document.getElementById('time-info').textContent = this.formatTime(this.video.currentTime);
        }
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    handleCanvasClick(event) {
        if (!this.bboxData || !this.bboxData.frames[this.currentFrame]) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Scale click coordinates to original video dimensions
        const scaleX = this.originalSize[0] / this.displaySize[0];
        const scaleY = this.originalSize[1] / this.displaySize[1];
        const originalX = clickX * scaleX;
        const originalY = clickY * scaleY;
        
        // Hit test against current frame's bounding boxes
        const frame = this.bboxData.frames[this.currentFrame];
        let hit = null;
        let bestArea = null;
        
        for (const box of frame.boxes) {
            const [x1, y1, x2, y2] = box.box;
            if (x1 <= originalX && originalX <= x2 && y1 <= originalY && originalY <= y2) {
                const area = (x2 - x1) * (y2 - y1);
                if (hit === null || area < bestArea) {
                    hit = box;
                    bestArea = area;
                }
            }
        }
        
        if (hit) {
            this.toggleVisibility(hit.id);
            console.log(`Toggled visibility for vessel ID: ${hit.id}`);
        } else {
            console.log(`Click at (${originalX}, ${originalY}) - no vessel hit`);
            console.log(`Current frame: ${this.currentFrame}, Available boxes:`, frame.boxes.length);
            if (frame.boxes.length > 0) {
                console.log('Available vessel boxes:', frame.boxes.map(b => ({id: b.id, box: b.box})));
            }
        }
    }
    
    toggleVisibility(vesselId) {
        this.visibility[vesselId] = !this.visibility[vesselId];
        this.drawCurrentFrame();
    }
    
    showAllVessels() {
        if (!this.bboxData || !this.bboxData.frames[this.currentFrame]) return;
        
        for (const box of this.bboxData.frames[this.currentFrame].boxes) {
            this.visibility[box.id] = true;
        }
        this.drawCurrentFrame();
    }
    
    hideAllVessels() {
        if (!this.bboxData || !this.bboxData.frames[this.currentFrame]) return;
        
        for (const box of this.bboxData.frames[this.currentFrame].boxes) {
            this.visibility[box.id] = false;
        }
        this.drawCurrentFrame();
    }
    
    drawCurrentFrame() {
        if (!this.bboxData || !this.bboxData.frames[this.currentFrame]) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const frame = this.bboxData.frames[this.currentFrame];
        const scaleX = this.displaySize[0] / this.originalSize[0];
        const scaleY = this.displaySize[1] / this.originalSize[1];
        
        for (const box of frame.boxes) {
            this.drawVesselBox(box, scaleX, scaleY);
        }
    }
    
    drawVesselBox(box, scaleX, scaleY) {
        const [x1, y1, x2, y2] = box.box;
        const scaledX1 = x1 * scaleX;
        const scaledY1 = y1 * scaleY;
        const scaledX2 = x2 * scaleX;
        const scaledY2 = y2 * scaleY;
        
        // Draw bounding box (corner style like in draw.py)
        this.drawCornerBox(scaledX1, scaledY1, scaledX2, scaledY2, box.color);
        
        // Draw AIS info if visible
        if (this.visibility[box.id] && box.has_ais && box.ais_data && box.inf_box) {
            this.drawAisInfo(box, scaleX, scaleY);
        } else if (this.visibility[box.id] && !box.has_ais && box.inf_box) {
            this.drawNoAisInfo(box, scaleX, scaleY);
        }
    }
    
    drawCornerBox(x1, y1, x2, y2, color) {
        const thickness = 2;
        const cornerLength = Math.min((x2 - x1) / 4, (y2 - y1) / 4);
        
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = thickness;
        
        // Top-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x1, y1 + cornerLength);
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x1 + cornerLength, y1);
        this.ctx.stroke();
        
        // Top-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y1);
        this.ctx.lineTo(x2, y1 + cornerLength);
        this.ctx.moveTo(x2, y1);
        this.ctx.lineTo(x2 - cornerLength, y1);
        this.ctx.stroke();
        
        // Bottom-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y2);
        this.ctx.lineTo(x1, y2 - cornerLength);
        this.ctx.moveTo(x1, y2);
        this.ctx.lineTo(x1 + cornerLength, y2);
        this.ctx.stroke();
        
        // Bottom-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2, y2 - cornerLength);
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - cornerLength, y2);
        this.ctx.stroke();
    }
    
    drawAisInfo(box, scaleX, scaleY) {
        const [infX1, infY1, infX2, infY2] = box.inf_box;
        const scaledInfX1 = infX1 * scaleX;
        const scaledInfY1 = infY1 * scaleY;
        const scaledInfX2 = infX2 * scaleX;
        const scaledInfY2 = infY2 * scaleY;
        
        // Draw info panel background
        this.ctx.strokeStyle = `rgb(${box.color[0]}, ${box.color[1]}, ${box.color[2]})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(scaledInfX1, scaledInfY1, scaledInfX2 - scaledInfX1, scaledInfY2 - scaledInfY1);
        
        // Draw connecting line
        const boxCenterX = (box.box[0] + box.box[2]) / 2 * scaleX;
        const boxBottomY = box.box[3] * scaleY;
        const infoCenterX = (scaledInfX1 + scaledInfX2) / 2;
        const infoTopY = scaledInfY1;
        
        this.ctx.beginPath();
        this.ctx.moveTo(boxCenterX, boxBottomY);
        this.ctx.lineTo(boxCenterX, infoTopY);
        this.ctx.lineTo(infoCenterX, infoTopY);
        this.ctx.stroke();
        
        // Draw AIS data text
        this.ctx.fillStyle = `rgb(${box.color[0]}, ${box.color[1]}, ${box.color[2]})`;
        this.ctx.font = '12px Arial';
        const lineHeight = 16;
        let y = scaledInfY1 + 16;
        
        const aisData = box.ais_data;
        this.ctx.fillText(`MMSI: ${aisData.mmsi}`, scaledInfX1 + 4, y);
        y += lineHeight;
        this.ctx.fillText(`SOG: ${aisData.sog}`, scaledInfX1 + 4, y);
        y += lineHeight;
        this.ctx.fillText(`COG: ${aisData.cog}`, scaledInfX1 + 4, y);
        y += lineHeight;
        this.ctx.fillText(`LAT: ${aisData.lat}`, scaledInfX1 + 4, y);
        y += lineHeight;
        this.ctx.fillText(`LON: ${aisData.lon}`, scaledInfX1 + 4, y);
    }
    
    drawNoAisInfo(box, scaleX, scaleY) {
        const [infX1, infY1, infX2, infY2] = box.inf_box;
        const scaledInfX1 = infX1 * scaleX;
        const scaledInfY1 = infY1 * scaleY;
        const scaledInfX2 = infX2 * scaleX;
        const scaledInfY2 = infY2 * scaleY;
        
        // Draw info panel background
        this.ctx.strokeStyle = `rgb(${box.color[0]}, ${box.color[1]}, ${box.color[2]})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(scaledInfX1, scaledInfY1, scaledInfX2 - scaledInfX1, scaledInfY2 - scaledInfY1);
        
        // Draw connecting line
        const boxCenterX = (box.box[0] + box.box[2]) / 2 * scaleX;
        const boxBottomY = box.box[3] * scaleY;
        const infoCenterX = (scaledInfX1 + scaledInfX2) / 2;
        const infoTopY = scaledInfY1;
        
        this.ctx.beginPath();
        this.ctx.moveTo(boxCenterX, boxBottomY);
        this.ctx.lineTo(boxCenterX, infoTopY);
        this.ctx.lineTo(infoCenterX, infoTopY);
        this.ctx.stroke();
        
        // Draw "NO AIS" text
        this.ctx.fillStyle = `rgb(${box.color[0]}, ${box.color[1]}, ${box.color[2]})`;
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('NO AIS', (scaledInfX1 + scaledInfX2) / 2, (scaledInfY1 + scaledInfY2) / 2 + 5);
        this.ctx.textAlign = 'left';
    }
    
    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VesselTracker();
});
