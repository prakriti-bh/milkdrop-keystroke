export class ActivityAnalyzer 
{
    private keystrokeBuffer: number[] = [];
    private cursorMovements: {x: number, y: number, time: number}[] = [];
    private editorSwitches: number[] = [];
    
    public analyzeKeystrokeIntensity(chars: number, timeDelta: number): number {
        if (timeDelta === 0) return 0;
        
        const charsPerSecond = chars / (timeDelta / 1000);
        this.keystrokeBuffer.push(charsPerSecond);
        
        // Keep only recent data (last 10 keystrokes)
        if (this.keystrokeBuffer.length > 10) {
            this.keystrokeBuffer.shift();
        }
        
        // Calculate weighted average (more weight to recent keystrokes)
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (let i = 0; i < this.keystrokeBuffer.length; i++) {
            const weight = (i + 1) / this.keystrokeBuffer.length; // Linear weighting
            weightedSum += this.keystrokeBuffer[i] * weight;
            totalWeight += weight;
        }
        
        const avgIntensity = weightedSum / totalWeight;
        return Math.min(avgIntensity / 15, 1.0); // Normalize to 0-1, assuming 15 chars/sec is max
    }
    
    public analyzeCursorFlow(newX: number, newY: number): number {
        const now = Date.now();
        const newMovement = {x: newX, y: newY, time: now};
        
        this.cursorMovements.push(newMovement);
        
        // Keep only recent movements (last 2 seconds)
        const cutoff = now - 2000;
        this.cursorMovements = this.cursorMovements.filter(m => m.time > cutoff);
        
        if (this.cursorMovements.length < 2) return 0;
        
        let totalDistance = 0;
        let totalTime = 0;
        
        for (let i = 1; i < this.cursorMovements.length; i++) {
            const prev = this.cursorMovements[i - 1];
            const curr = this.cursorMovements[i];
            
            const distance = Math.sqrt(
                Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
            );
            const timeDiff = curr.time - prev.time;
            
            totalDistance += distance;
            totalTime += timeDiff;
        }
        
        if (totalTime === 0) return 0;
        
        const averageSpeed = totalDistance / (totalTime / 1000); // distance per second
        return Math.min(averageSpeed / 100, 1.0); // Normalize assuming 100 units/sec is max
    }
    
    public analyzeChaos(simultaneousEdits: number, rapidChanges: boolean): number {
        let chaos = 0;
        
        // Multiple simultaneous edits increase chaos
        chaos += simultaneousEdits * 0.2;
        
        // Rapid consecutive changes increase chaos
        if (rapidChanges) {
            chaos += 0.3;
        }
        
        return Math.min(chaos, 1.0);
    }
    
    public analyzeHeat(linesModified: number, totalLines: number): number {
        if (totalLines === 0) return 0;
        
        // Heat is based on percentage of file being modified
        const modificationRatio = linesModified / Math.max(totalLines, 1);
        return Math.min(modificationRatio * 5, 1.0); // Scale up and cap at 1.0
    }
    
    public analyzeFocus(timeInEditor: number, editorSwitches: number): number {
        // Focus increases with time spent in editor
        let focus = Math.min(timeInEditor / 60000, 1.0); // Max focus after 1 minute
        
        // But decreases with frequent editor switches
        const switchPenalty = Math.min(editorSwitches * 0.1, 0.5);
        focus = Math.max(focus - switchPenalty, 0);
        
        return focus;
    }
}
