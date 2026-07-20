import { useState, useEffect } from "react";
import { Check, AlertCircle } from "lucide-react";
import { Button } from "./Button";

export type FingerName =
  | "Left Thumb"
  | "Left Index"
  | "Left Middle"
  | "Left Ring"
  | "Left Pinky"
  | "Right Thumb"
  | "Right Index"
  | "Right Middle"
  | "Right Ring"
  | "Right Pinky";

interface MultiFingerSelectorProps {
  selectedFingers: FingerName[];
  onChange: (fingers: FingerName[]) => void;
  onScanComplete: () => void;
  error?: string;
}


export function MultiFingerSelector({
  selectedFingers,
  onChange,
  onScanComplete,
  error,
}: MultiFingerSelectorProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isCaptured, setIsCaptured] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // If selectedFingers changes from outside and it's less than 4, reset captured state
  useEffect(() => {
    if (selectedFingers.length < 4) {
      setIsCaptured(false);
      setScanProgress(0);
    }
  }, [selectedFingers]);

  function handleToggle(finger: FingerName) {
    if (isScanning || isCaptured) return; // Prevent changing during/after scan

    const isSelected = selectedFingers.includes(finger);
    if (isSelected) {
      onChange(selectedFingers.filter((f) => f !== finger));
    } else {
      if (selectedFingers.length >= 4) {
        // Already 4, replace the oldest one? Or just prevent adding.
        // Let's prevent adding, they have to deselect first.
        return;
      }
      onChange([...selectedFingers, finger]);
    }
  }

  function handleScanStart() {
    if (selectedFingers.length !== 4) return;
    
    // Validate constraint
    const leftCount = selectedFingers.filter((f) => f.startsWith("Left ")).length;
    if (leftCount < 2) {
      return; // Handled by external validation, but we can prevent scanning
    }

    setIsScanning(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsScanning(false);
        setIsCaptured(true);
        onScanComplete();
      }
    }, 100);
  }


  const leftCount = selectedFingers.filter((f) => f.startsWith("Left ")).length;
  const isValidSelection = selectedFingers.length === 4 && leftCount >= 2;
  const showConstraintError = selectedFingers.length === 4 && leftCount < 2;

  const fingerProps = (finger: FingerName) => ({
    isSelected: selectedFingers.includes(finger),
    isScanning,
    isCaptured,
    isDisabled: isScanning || isCaptured || (!selectedFingers.includes(finger) && selectedFingers.length >= 4),
    scanProgress,
    onToggle: () => handleToggle(finger)
  });

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <div className="flex w-full justify-between gap-8 mb-12">
        
        {/* Left Hand */}
        <div className="flex-1 flex flex-col items-center">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-8">Left Hand</p>
          <div className="relative w-[140px] h-[180px]">
            {/* Organic Palm Silhouette */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-[20px] top-[75px] w-[80px] h-[80px] bg-white/[0.04]" />
              <div className="absolute left-[4px] top-[70px] w-[35px] h-[75px] -rotate-12 rounded-full bg-white/[0.04]" />
              <div className="absolute left-[70px] top-[70px] w-[60px] h-[85px] rotate-[20deg] rounded-[35px] bg-white/[0.04]" />
              <div className="absolute left-[25px] top-[140px] w-[65px] h-[25px] rounded-b-[30px] bg-white/[0.04]" />
              {/* Static finger bases to merge with palm */}
              <div className="absolute left-[4px] top-[35px] w-[22px] h-[60px] -rotate-[12deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[28px] top-[15px] w-[24px] h-[75px] -rotate-[4deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[56px] top-[5px] w-[24px] h-[85px] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[84px] top-[15px] w-[24px] h-[75px] rotate-[4deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[110px] top-[55px] w-[26px] h-[65px] rotate-[35deg] rounded-full bg-white/[0.04]" />
            </div>
            
            {/* Interactive Finger Buttons */}
            <FingerButton finger="Left Pinky" className="left-[4px] top-[35px] w-[22px] h-[60px] -rotate-[12deg]" {...fingerProps("Left Pinky")} />
            <FingerButton finger="Left Ring" className="left-[28px] top-[15px] w-[24px] h-[75px] -rotate-[4deg]" {...fingerProps("Left Ring")} />
            <FingerButton finger="Left Middle" className="left-[56px] top-[5px] w-[24px] h-[85px]" {...fingerProps("Left Middle")} />
            <FingerButton finger="Left Index" className="left-[84px] top-[15px] w-[24px] h-[75px] rotate-[4deg]" {...fingerProps("Left Index")} />
            <FingerButton finger="Left Thumb" className="left-[110px] top-[55px] w-[26px] h-[65px] rotate-[35deg]" {...fingerProps("Left Thumb")} />
          </div>
        </div>

        {/* Right Hand */}
        <div className="flex-1 flex flex-col items-center">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-8">Right Hand</p>
          <div className="relative w-[140px] h-[180px]">
            {/* Organic Palm Silhouette */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-[40px] top-[75px] w-[80px] h-[80px] bg-white/[0.04]" />
              <div className="absolute left-[10px] top-[70px] w-[60px] h-[85px] -rotate-[20deg] rounded-[35px] bg-white/[0.04]" />
              <div className="absolute left-[101px] top-[70px] w-[35px] h-[75px] rotate-[12deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[50px] top-[140px] w-[65px] h-[25px] rounded-b-[30px] bg-white/[0.04]" />
              {/* Static finger bases to merge with palm */}
              <div className="absolute left-[4px] top-[55px] w-[26px] h-[65px] -rotate-[35deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[32px] top-[15px] w-[24px] h-[75px] -rotate-[4deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[60px] top-[5px] w-[24px] h-[85px] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[88px] top-[15px] w-[24px] h-[75px] rotate-[4deg] rounded-full bg-white/[0.04]" />
              <div className="absolute left-[114px] top-[35px] w-[22px] h-[60px] rotate-[12deg] rounded-full bg-white/[0.04]" />
            </div>
            
            {/* Interactive Finger Buttons */}
            <FingerButton finger="Right Thumb" className="left-[4px] top-[55px] w-[26px] h-[65px] -rotate-[35deg]" {...fingerProps("Right Thumb")} />
            <FingerButton finger="Right Index" className="left-[32px] top-[15px] w-[24px] h-[75px] -rotate-[4deg]" {...fingerProps("Right Index")} />
            <FingerButton finger="Right Middle" className="left-[60px] top-[5px] w-[24px] h-[85px]" {...fingerProps("Right Middle")} />
            <FingerButton finger="Right Ring" className="left-[88px] top-[15px] w-[24px] h-[75px] rotate-[4deg]" {...fingerProps("Right Ring")} />
            <FingerButton finger="Right Pinky" className="left-[114px] top-[35px] w-[22px] h-[60px] rotate-[12deg]" {...fingerProps("Right Pinky")} />
          </div>
        </div>

      </div>

      <div className="flex flex-col items-center gap-3 w-full">
        <div className="text-sm font-medium text-ink-muted flex items-center justify-between w-full px-2">
          <span>Selected: {selectedFingers.length}/4</span>
          <span className={leftCount < 2 && selectedFingers.length > 0 ? "text-status-warn" : "text-ink-faint"}>
            Left hand: {leftCount}/2 min
          </span>
        </div>

        {/* Progress bar for selection */}
        <div className="w-full h-1.5 bg-ledger-line rounded-full overflow-hidden flex">
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`flex-1 border-r border-ledger last:border-0 transition-colors duration-300 ${
                i < selectedFingers.length 
                  ? (showConstraintError ? "bg-status-warn" : "bg-signal-bright") 
                  : "bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Warnings & Errors */}
        {showConstraintError && (
          <div className="w-full mt-2 flex gap-2 items-start text-status-warn bg-status-warn/10 p-2.5 rounded border border-status-warn/20 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>You must select at least 2 fingers from the left hand.</p>
          </div>
        )}
        
        {error && !showConstraintError && (
          <div className="w-full mt-2 text-center text-xs text-status-fail">
            {error}
          </div>
        )}

        {/* Action Button */}
        <div className="mt-4 w-full">
          {isCaptured ? (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 text-status-ok bg-status-ok/10 border border-status-ok/30 rounded-lg font-semibold text-sm">
              <Check className="w-4 h-4" />
              Capture Complete
            </div>
          ) : (
            <Button 
              className="w-full" 
              onClick={handleScanStart}
              disabled={!isValidSelection || isScanning}
              isLoading={isScanning}
            >
              {isScanning ? "Scanning..." : "Scan Selected Fingers"}
            </Button>
          )}
        </div>
        
        {isCaptured && (
          <button 
            type="button" 
            onClick={() => {
              setIsCaptured(false);
              setScanProgress(0);
              onChange([]);
            }}
            className="text-xs text-ink-faint hover:text-ink transition-colors mt-2"
          >
            Reset and rescan
          </button>
        )}
      </div>
    </div>
  );
}

interface FingerButtonProps {
  finger: FingerName;
  className: string;
  isSelected: boolean;
  isScanning: boolean;
  isCaptured: boolean;
  isDisabled: boolean;
  scanProgress: number;
  onToggle: () => void;
}

function FingerButton({
  finger,
  className,
  isSelected,
  isScanning,
  isCaptured,
  isDisabled,
  scanProgress,
  onToggle
}: FingerButtonProps) {
  let base = "absolute rounded-full transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ledger";
  
  let stateClasses = "bg-transparent text-transparent hover:bg-white/[0.04]";
  
  if (isCaptured && isSelected) {
    stateClasses = "bg-status-ok/20 text-status-ok";
  } else if (isScanning && isSelected) {
    stateClasses = "bg-signal/20 text-signal-bright";
  } else if (isSelected) {
    stateClasses = "bg-signal/20 shadow-[inset_0_0_15px_rgba(var(--color-signal),0.3)]";
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isDisabled}
      className={`${base} ${stateClasses} ${className}`}
      title={finger}
    >
      {/* Visual checkmark if selected (imitating the user's reference) */}
      {isSelected && !isScanning && !isCaptured && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center justify-center w-4 h-4 bg-signal rounded-full shadow-sm text-ledger">
          <Check className="w-3 h-3 stroke-[3]" />
        </div>
      )}
      {/* Captured checkmark */}
      {isCaptured && isSelected && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center justify-center w-4 h-4 bg-status-ok rounded-full shadow-sm text-ledger">
          <Check className="w-3 h-3 stroke-[3]" />
        </div>
      )}
      {/* Scanning overlay */}
      {isScanning && isSelected && (
        <div 
          className="absolute bottom-0 left-0 right-0 bg-signal-bright/30 transition-all duration-100" 
          style={{ height: `${scanProgress}%` }} 
        />
      )}
    </button>
  );
}
