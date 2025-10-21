class VesselTracker {
    constructor() {
        this.bboxData = null;
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('overlay');
        this.ctx = this.canvas.getContext('2d');
        this.visibility = {}; // Track visibility state for each vessel ID
        this.expanded = {}; // Track expanded state for each vessel ID (more/hide button)
        this.currentFrame = 0;
        this.originalSize = [1920, 1080];
        this.displaySize = [500, 281];
        
        // Configurable parameters for info box positioning and sizing
        this.infoBoxParams = {
            width: 80,           // Width of the info box in pixels
            offsetFromBottom: 10, // Distance from bottom of vessel box to info box
            buttonWidth: 40,      // Width of more/hide button
            buttonHeight: 16,     // Height of more/hide button
            textPadding: 1,       // Padding around text
            lineHeight: 8,       // Height between text lines
            verticalOffset: -40,  // Adjust info box position upward (negative = up, positive = down)
            horizontalSpacing: 10 // Minimum spacing between boxes to prevent overlap
        };
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadBboxData();
            this.setupEventListeners();
            // this.updateStatus('Ready - Click on vessels to toggle AIS info');
        } catch (error) {
            // this.updateStatus('Error loading data: ' + error.message);
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
        // const frame = this.bboxData.frames[this.currentFrame];
        // if (frame) {
        //     document.getElementById('frame-info').textContent = this.currentFrame;
        //     document.getElementById('time-info').textContent = this.formatTime(this.video.currentTime);
        // }
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
        
        // First check for clicks on more/hide buttons in visible AIS info panels
        const frame = this.bboxData.frames[this.currentFrame];
        const visibleBoxes = frame.boxes.filter(box => this.visibility[box.id]);
        const adjustedBoxes = this.adjustBoxPositions(visibleBoxes, 
            this.displaySize[0] / this.originalSize[0], 
            this.displaySize[1] / this.originalSize[1]);
            
        for (const box of frame.boxes) {
            if (this.visibility[box.id] && box.has_ais && box.ais_data && box.inf_box) {
                const adjustedPos = adjustedBoxes[box.id];
                if (!adjustedPos) continue;
                
                const finalX1 = adjustedPos.x;
                const finalY1 = adjustedPos.y;
                const finalX2 = finalX1 + this.infoBoxParams.width;
                const finalY2 = finalY1 + adjustedPos.height;
                
                // Check if click is within info panel
                if (finalX1 <= clickX && clickX <= finalX2 && finalY1 <= clickY && clickY <= finalY2) {
                    // Calculate button position (centered below MMSI, ensure it fits within box)
                    const lineHeight = this.infoBoxParams.lineHeight;
                    const textPadding = this.infoBoxParams.textPadding;
                    const buttonWidth = Math.min(this.infoBoxParams.buttonWidth, this.infoBoxParams.width - (textPadding * 2));
                    const buttonHeight = this.infoBoxParams.buttonHeight;
                    
                    // Button centered below MMSI text, within box boundaries
                    const buttonX = finalX1 + textPadding + (this.infoBoxParams.width - (textPadding * 2) - buttonWidth) / 2;
                    const buttonY = finalY1 + textPadding + lineHeight + 4;
                    
                    if (clickX >= buttonX && clickX <= buttonX + buttonWidth && 
                        clickY >= buttonY && clickY <= buttonY + buttonHeight) {
                        this.toggleExpanded(box.id);
                        return;
                    }
                }
            }
        }
        
        // Hit test against current frame's bounding boxes
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
        }
    }
    
    toggleVisibility(vesselId) {
        this.visibility[vesselId] = !this.visibility[vesselId];
        this.drawCurrentFrame();
    }
    
    toggleExpanded(vesselId) {
        this.expanded[vesselId] = !this.expanded[vesselId];
        this.drawCurrentFrame();
    }
    
    showAllVessels() {
        if (!this.bboxData || !this.bboxData.frames[this.currentFrame]) return;
        
        for (const box of this.bboxData.frames[this.currentFrame].boxes) {
            this.visibility[box.id] = true;
            // Preserve expanded state - don't reset it
        }
        this.drawCurrentFrame();
    }
    
    hideAllVessels() {
        if (!this.bboxData || !this.bboxData.frames[this.currentFrame]) return;
        
        for (const box of this.bboxData.frames[this.currentFrame].boxes) {
            this.visibility[box.id] = false;
            // Preserve expanded state - don't reset it
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
        
        // Get visible boxes and adjust their positions to prevent overlap
        const visibleBoxes = frame.boxes.filter(box => this.visibility[box.id]);
        const adjustedBoxes = this.adjustBoxPositions(visibleBoxes, scaleX, scaleY);
        
        for (const box of frame.boxes) {
            this.drawVesselBox(box, scaleX, scaleY, adjustedBoxes);
        }
    }
    
    adjustBoxPositions(boxes, scaleX, scaleY) {
        const adjustedPositions = {};
        const spacing = this.infoBoxParams.horizontalSpacing;
        
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            if (!this.visibility[box.id] || !box.inf_box) continue;
            
            const [infX1, infY1, infX2, infY2] = box.inf_box;
            const scaledInfX1 = infX1 * scaleX;
            const scaledInfY1 = infY1 * scaleY + this.infoBoxParams.verticalOffset;
            
            // Calculate dynamic height
            const isExpanded = this.expanded[box.id] || false;
            const lineHeight = this.infoBoxParams.lineHeight;
            const textPadding = this.infoBoxParams.textPadding;
            const buttonHeight = this.infoBoxParams.buttonHeight;
            
            let contentHeight = textPadding + lineHeight + 4 + buttonHeight;
            if (isExpanded) {
                contentHeight += 8 + (lineHeight * 4);
            }
            contentHeight += textPadding;
            
            let adjustedX = scaledInfX1;
            
            // Check for overlaps with previously positioned boxes
            for (let j = 0; j < i; j++) {
                const prevBox = boxes[j];
                if (!this.visibility[prevBox.id] || !prevBox.inf_box) continue;
                
                const prevAdjusted = adjustedPositions[prevBox.id];
                if (!prevAdjusted) continue;
                
                // Check if boxes would overlap horizontally
                const boxRight = adjustedX + this.infoBoxParams.width;
                const prevBoxRight = prevAdjusted.x + this.infoBoxParams.width;
                
                if (adjustedX < prevBoxRight + spacing && boxRight > prevAdjusted.x - spacing) {
                    // Move this box to the right of the previous one
                    adjustedX = prevBoxRight + spacing;
                }
            }
            
            adjustedPositions[box.id] = {
                x: adjustedX,
                y: scaledInfY1,
                height: contentHeight
            };
        }
        
        return adjustedPositions;
    }
    
    drawVesselBox(box, scaleX, scaleY, adjustedBoxes = null) {
        const [x1, y1, x2, y2] = box.box;
        const scaledX1 = x1 * scaleX;
        const scaledY1 = y1 * scaleY;
        const scaledX2 = x2 * scaleX;
        const scaledY2 = y2 * scaleY;
        
        // Override color to blue for web interface
        const blueColor = [0, 100, 200]; // RGB values for blue
        
        // Draw bounding box (corner style like in draw.py)
        this.drawCornerBox(scaledX1, scaledY1, scaledX2, scaledY2, blueColor);
        
        // Draw AIS info if visible
        if (this.visibility[box.id] && box.has_ais && box.ais_data && box.inf_box) {
            this.drawAisInfo(box, scaleX, scaleY, blueColor, adjustedBoxes);
        } else if (this.visibility[box.id] && !box.has_ais && box.inf_box) {
            this.drawNoAisInfo(box, scaleX, scaleY, blueColor, adjustedBoxes);
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
    
    drawAisInfo(box, scaleX, scaleY, color, adjustedBoxes = null) {
        const [infX1, infY1, infX2, infY2] = box.inf_box;
        const scaledInfX1 = infX1 * scaleX;
        const scaledInfY1 = infY1 * scaleY + this.infoBoxParams.verticalOffset;
        
        // Use adjusted position if available
        const adjustedPos = adjustedBoxes && adjustedBoxes[box.id];
        const finalX1 = adjustedPos ? adjustedPos.x : scaledInfX1;
        const finalY1 = adjustedPos ? adjustedPos.y : scaledInfY1;
        
        const aisData = box.ais_data;
        const isExpanded = this.expanded[box.id] || false;
        
        // Calculate dynamic box size based on content
        const lineHeight = this.infoBoxParams.lineHeight;
        const textPadding = this.infoBoxParams.textPadding;
        const buttonHeight = this.infoBoxParams.buttonHeight;
        
        // Calculate height based on content
        let contentHeight = textPadding + lineHeight + 4 + buttonHeight; // MMSI + button
        if (isExpanded) {
            contentHeight += 8 + (lineHeight * 4); // Gap + 4 additional lines
        }
        contentHeight += textPadding; // Bottom padding
        
        // Use dynamic width and height
        const finalX2 = finalX1 + this.infoBoxParams.width;
        const finalY2 = finalY1 + contentHeight;
        
        // Draw info panel background
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(finalX1, finalY1, finalX2 - finalX1, finalY2 - finalY1);
        
        // Draw connecting line
        const boxCenterX = (box.box[0] + box.box[2]) / 2 * scaleX;
        const boxBottomY = box.box[3] * scaleY;
        const infoCenterX = (finalX1 + finalX2) / 2;
        const infoTopY = finalY1;
        
        this.ctx.beginPath();
        this.ctx.moveTo(boxCenterX, boxBottomY);
        this.ctx.lineTo(boxCenterX, infoTopY);
        this.ctx.lineTo(infoCenterX, infoTopY);
        this.ctx.stroke();
        
        // Draw AIS data text with smaller font
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.font = '10px Arial';
        let y = finalY1 + textPadding + lineHeight;
        
        // Always show MMSI
        this.ctx.fillText(`MMSI: ${aisData.mmsi}`, finalX1 + textPadding, y);
        y += lineHeight;
        
        // Draw more/hide button below MMSI (centered, ensure it fits within box)
        const buttonWidth = Math.min(this.infoBoxParams.buttonWidth, this.infoBoxParams.width - (textPadding * 2));
        const buttonX = finalX1 + textPadding + (this.infoBoxParams.width - (textPadding * 2) - buttonWidth) / 2;
        const buttonY = y + 4;
        
        // Button background
        this.ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.2)`;
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // Button border
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // Button text
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        const buttonText = isExpanded ? 'Hide' : 'More';
        this.ctx.fillText(buttonText, buttonX + buttonWidth / 2, buttonY + 10);
        this.ctx.textAlign = 'left';
        
        // Show additional info below button only if expanded
        if (isExpanded) {
            y = buttonY + buttonHeight + 8; // Position below button
            this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`SOG: ${aisData.sog}`, finalX1 + textPadding, y);
            y += lineHeight;
            this.ctx.fillText(`COG: ${aisData.cog}`, finalX1 + textPadding, y);
            y += lineHeight;
            this.ctx.fillText(`LAT: ${aisData.lat}`, finalX1 + textPadding, y);
            y += lineHeight;
            this.ctx.fillText(`LON: ${aisData.lon}`, finalX1 + textPadding, y);
        }
    }
    
    drawNoAisInfo(box, scaleX, scaleY, color, adjustedBoxes = null) {
        const [infX1, infY1, infX2, infY2] = box.inf_box;
        const scaledInfX1 = infX1 * scaleX;
        const scaledInfY1 = infY1 * scaleY + this.infoBoxParams.verticalOffset;
        
        // Use adjusted position if available
        const adjustedPos = adjustedBoxes && adjustedBoxes[box.id];
        const finalX1 = adjustedPos ? adjustedPos.x : scaledInfX1;
        const finalY1 = adjustedPos ? adjustedPos.y : scaledInfY1;
        
        // Calculate dynamic box size for NO AIS (smaller box)
        const textPadding = this.infoBoxParams.textPadding;
        const contentHeight = textPadding + 20 + textPadding; // Text height + padding
        
        // Use dynamic width and height
        const finalX2 = finalX1 + this.infoBoxParams.width;
        const finalY2 = finalY1 + contentHeight;
        
        // Draw info panel background
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(finalX1, finalY1, finalX2 - finalX1, finalY2 - finalY1);
        
        // Draw connecting line
        const boxCenterX = (box.box[0] + box.box[2]) / 2 * scaleX;
        const boxBottomY = box.box[3] * scaleY;
        const infoCenterX = (finalX1 + finalX2) / 2;
        const infoTopY = finalY1;
        
        this.ctx.beginPath();
        this.ctx.moveTo(boxCenterX, boxBottomY);
        this.ctx.lineTo(boxCenterX, infoTopY);
        this.ctx.lineTo(infoCenterX, infoTopY);
        this.ctx.stroke();
        
        // Draw "NO AIS" text
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('NO AIS', (finalX1 + finalX2) / 2, (finalY1 + finalY2) / 2 + 5);
        this.ctx.textAlign = 'left';
    }
    
    // updateStatus(message) {
    //     document.getElementById('status').textContent = message;
    // }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VesselTracker();
});
