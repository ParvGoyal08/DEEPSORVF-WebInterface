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
        this.displaySize = [500, 281]; // Will be updated when video loads
        this.baseDisplaySize = [500, 281]; // Original display size from JSON
        this.shipLogo = null; // Ship logo image
        this.logoPositions = {}; // Track logo positions for click detection
        
        // Configurable parameters for info box positioning and sizing
        this.infoBoxParams = {
            width: 120,          // Width of the info box in pixels (increased for text)
            offsetFromBottom: 10, // Distance from bottom of vessel box to info box
            buttonWidth: 50,      // Width of more/hide button (increased)
            buttonHeight: 20,     // Height of more/hide button (increased)
            textPadding: 5,       // Padding around text (increased)
            lineHeight: 17,       // Height between text lines (increased for 13px font)
            verticalOffset: -40,  // Adjust info box position upward (negative = up, positive = down)
            horizontalSpacing: 10 // Minimum spacing between boxes to prevent overlap
        };
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadBboxData();
            await this.loadShipLogo();
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
        // Store the original display size from JSON, but we'll update it based on actual video size
        this.baseDisplaySize = this.bboxData.display_size;
        
        // Wait for video to load metadata to get actual display size
        if (this.video.readyState >= 1) {
            this.syncCanvasSize();
        }
        
        // Initially disable canvas interaction (video starts paused)
        this.canvas.style.pointerEvents = 'none';
        
        console.log(`Loaded ${this.bboxData.frames.length} frames`);
    }
    
    async loadShipLogo() {
        return new Promise((resolve, reject) => {
            this.shipLogo = new Image();
            this.shipLogo.onload = () => {
                console.log('Ship logo loaded successfully');
                resolve();
            };
            this.shipLogo.onerror = () => {
                console.error('Failed to load ship logo');
                reject(new Error('Failed to load ship logo'));
            };
            this.shipLogo.src = '/static/images/ship_logo.png';
        });
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
        
        // Handle video load events to keep canvas in sync
        this.video.addEventListener('loadedmetadata', () => {
            // Small delay to ensure video element has rendered
            setTimeout(() => this.syncCanvasSize(), 100);
        });
        
        this.video.addEventListener('loadeddata', () => {
            setTimeout(() => this.syncCanvasSize(), 100);
        });
        
        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.syncCanvasSize(), 100);
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
    
    syncCanvasSize() {
        // Sync canvas size with actual video display size
        const videoRect = this.video.getBoundingClientRect();
        if (videoRect.width > 0 && videoRect.height > 0) {
            // Get the actual video element dimensions (not just the bounding rect)
            const videoWidth = this.video.videoWidth || videoRect.width;
            const videoHeight = this.video.videoHeight || videoRect.height;
            
            // Calculate the actual displayed size (accounting for CSS scaling)
            const displayedWidth = videoRect.width;
            const displayedHeight = videoRect.height;
            
            // Update display size based on actual rendered video size
            this.displaySize = [displayedWidth, displayedHeight];
            
            // CRITICAL: Set canvas internal resolution to match CSS size exactly
            // This prevents stretching and ensures pixel-perfect alignment
            this.canvas.width = displayedWidth;
            this.canvas.height = displayedHeight;
            
            // Set canvas CSS size to match video element exactly
            this.canvas.style.width = displayedWidth + 'px';
            this.canvas.style.height = displayedHeight + 'px';
            
            // Ensure canvas is positioned correctly (should already be absolute positioned)
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '8px';
            this.canvas.style.left = '8px';
            
            console.log(`Canvas synced: ${displayedWidth}x${displayedHeight}, Original: ${this.originalSize[0]}x${this.originalSize[1]}`);
            
            // Redraw current frame with new size
            if (this.bboxData) {
                this.drawCurrentFrame();
            }
        }
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
        
        // Hit test against ship logos
        for (const vesselId in this.logoPositions) {
            const logoPos = this.logoPositions[vesselId];
            if (logoPos.x <= clickX && clickX <= logoPos.x + logoPos.width &&
                logoPos.y <= clickY && clickY <= logoPos.y + logoPos.height) {
                this.toggleVisibility(vesselId);
                return;
            }
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
        
        // Clear logo positions for this frame
        this.logoPositions = {};
        
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
        const logoSize = 20;
        const offset = 5;
        const gap = 5;
        
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            if (!this.visibility[box.id]) continue;
            
            // Calculate logo position (centered horizontally above the box)
            const [x1, y1, x2, y2] = box.box;
            const scaledX1 = x1 * scaleX;
            const scaledY1 = y1 * scaleY;
            const scaledX2 = x2 * scaleX;
            const scaledY2 = y2 * scaleY;
            
            const logoX = (scaledX1 + scaledX2) / 2 - logoSize / 2;
            const logoY = scaledY1 - logoSize - offset;
            
            // Position info box below the ship logo, centered horizontally with bounding box
            const boxCenterX = (scaledX1 + scaledX2) / 2;
            const adjustedX = boxCenterX - this.infoBoxParams.width / 2;
            const adjustedY = logoY + logoSize + gap;
            
            // Calculate dynamic height based on AIS status
            let contentHeight;
            if (box.has_ais && box.ais_data) {
                // Has AIS data - calculate height based on expanded state
                const isExpanded = this.expanded[box.id] || false;
                const lineHeight = this.infoBoxParams.lineHeight;
                const textPadding = this.infoBoxParams.textPadding;
                const buttonHeight = this.infoBoxParams.buttonHeight;
                
                // Calculate height: padding + MMSI line + gap + button + (if expanded: gap + 4 more lines)
                contentHeight = textPadding + lineHeight + 3 + buttonHeight;
                if (isExpanded) {
                    contentHeight += 6 + (lineHeight * 4); // Gap + 4 lines of data
                }
                contentHeight += textPadding;
            } else {
                // No AIS data - smaller box
                const textPadding = this.infoBoxParams.textPadding;
                contentHeight = textPadding + 20 + textPadding;
            }
            
            let finalX = adjustedX;
            
            // Check for overlaps with previously positioned boxes
            for (let j = 0; j < i; j++) {
                const prevBox = boxes[j];
                if (!this.visibility[prevBox.id]) continue;
                
                const prevAdjusted = adjustedPositions[prevBox.id];
                if (!prevAdjusted) continue;
                
                // Check if boxes would overlap horizontally
                const boxRight = finalX + this.infoBoxParams.width;
                const prevBoxRight = prevAdjusted.x + this.infoBoxParams.width;
                
                if (finalX < prevBoxRight + spacing && boxRight > prevAdjusted.x - spacing) {
                    // Move this box to the right of the previous one
                    finalX = prevBoxRight + spacing;
                }
            }
            
            adjustedPositions[box.id] = {
                x: finalX,
                y: adjustedY,
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
        
        // Draw ship logo above the bounding box
        this.drawShipLogo(box.id, scaledX1, scaledY1, scaledX2, scaledY2);
        
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
    
    drawShipLogo(vesselId, x1, y1, x2, y2) {
        if (!this.shipLogo) return;
        
        // Logo size and positioning
        const logoSize = 20;
        const offset = 5; // Distance above the bounding box
        
        // Calculate logo position (centered horizontally above the box)
        const logoX = (x1 + x2) / 2 - logoSize / 2;
        const logoY = y1 - logoSize - offset;
        
        // Store logo position for click detection
        this.logoPositions[vesselId] = {
            x: logoX,
            y: logoY,
            width: logoSize,
            height: logoSize
        };
        
        // Draw the ship logo
        this.ctx.drawImage(this.shipLogo, logoX, logoY, logoSize, logoSize);
    }
    
    drawAisInfo(box, scaleX, scaleY, color, adjustedBoxes = null) {
        // Use adjusted position from adjustBoxPositions
        const adjustedPos = adjustedBoxes && adjustedBoxes[box.id];
        if (!adjustedPos) return;
        
        const finalX1 = adjustedPos.x;
        const finalY1 = adjustedPos.y;
        
        const aisData = box.ais_data;
        const isExpanded = this.expanded[box.id] || false;
        
        // Calculate dynamic box size based on content
        const lineHeight = this.infoBoxParams.lineHeight;
        const textPadding = this.infoBoxParams.textPadding;
        const buttonHeight = this.infoBoxParams.buttonHeight;
        
        // Use dynamic width and height
        const finalX2 = finalX1 + this.infoBoxParams.width;
        const finalY2 = finalY1 + adjustedPos.height;
        
        // Draw translucent background for better readability
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; // Dark translucent background
        this.ctx.fillRect(finalX1, finalY1, finalX2 - finalX1, finalY2 - finalY1);
        
        // Draw info panel border
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(finalX1, finalY1, finalX2 - finalX1, finalY2 - finalY1);
        
        // Draw AIS data text with larger, bolder, darker font
        this.ctx.fillStyle = '#ffffff'; // White text for contrast against dark background
        this.ctx.font = 'bold 13px Arial';
        this.ctx.textBaseline = 'top';
        let y = finalY1 + textPadding;
        
        // Always show MMSI (with proper spacing)
        const mmsiText = `MMSI: ${aisData.mmsi}`;
        // Check if text fits, if not, truncate or use smaller font
        const maxTextWidth = this.infoBoxParams.width - (textPadding * 2);
        this.ctx.fillText(mmsiText, finalX1 + textPadding, y);
        y += lineHeight;
        
        // Draw more/hide button below MMSI (centered, ensure it fits within box)
        const buttonWidth = Math.min(this.infoBoxParams.buttonWidth, this.infoBoxParams.width - (textPadding * 2));
        let buttonX = finalX1 + textPadding + (this.infoBoxParams.width - (textPadding * 2) - buttonWidth) / 2;
        const buttonY = y + 3; // Small gap after MMSI
        
        // Ensure button stays within box bounds
        if (buttonX + buttonWidth > finalX2 - textPadding) {
            // Adjust button position if it would overflow
            const adjustedButtonX = finalX2 - textPadding - buttonWidth;
            if (adjustedButtonX >= finalX1 + textPadding) {
                buttonX = adjustedButtonX;
            }
        }
        
        // Button background with better visibility
        this.ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.4)`;
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // Button border
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // Button text (centered vertically and horizontally)
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 11px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const buttonText = isExpanded ? 'Hide' : 'More';
        this.ctx.fillText(buttonText, buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // Show additional info below button only if expanded
        if (isExpanded) {
            y = buttonY + buttonHeight + 6; // Position below button with spacing
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 13px Arial';
            this.ctx.textBaseline = 'top';
            
            // Draw each line with proper spacing and check for overflow
            const lines = [
                `SOG: ${aisData.sog}`,
                `COG: ${aisData.cog}`,
                `LAT: ${aisData.lat}`,
                `LON: ${aisData.lon}`
            ];
            
            for (const line of lines) {
                this.ctx.fillText(line, finalX1 + textPadding, y);
                y += lineHeight;
            }
        }
    }
    
    drawNoAisInfo(box, scaleX, scaleY, color, adjustedBoxes = null) {
        // Use adjusted position from adjustBoxPositions
        const adjustedPos = adjustedBoxes && adjustedBoxes[box.id];
        if (!adjustedPos) return;
        
        const finalX1 = adjustedPos.x;
        const finalY1 = adjustedPos.y;
        
        // Calculate dynamic box size for NO AIS (smaller box)
        const textPadding = this.infoBoxParams.textPadding;
        const contentHeight = textPadding + 25 + textPadding; // Text height + padding (increased for 16px font)
        
        // Use dynamic width and height
        const finalX2 = finalX1 + this.infoBoxParams.width;
        const finalY2 = finalY1 + contentHeight;
        
        // Draw translucent background for better readability
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; // Dark translucent background
        this.ctx.fillRect(finalX1, finalY1, finalX2 - finalX1, finalY2 - finalY1);
        
        // Draw info panel border
        this.ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(finalX1, finalY1, finalX2 - finalX1, finalY2 - finalY1);
        
        // Draw "NO AIS" text with larger, bolder, darker font
        this.ctx.fillStyle = '#ffffff'; // White text for contrast
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('NO AIS', (finalX1 + finalX2) / 2, (finalY1 + finalY2) / 2);
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
    }
    
    // updateStatus(message) {
    //     document.getElementById('status').textContent = message;
    // }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VesselTracker();
});
