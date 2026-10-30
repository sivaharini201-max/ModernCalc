/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { DisplayScreen } from './components/DisplayScreen.tsx';
import { Keypad } from './components/Keypad.tsx';
import { UnitConverterView } from './components/UnitConverterView.tsx';
import { HistoryDrawer } from './components/HistoryDrawer.tsx';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal.tsx';
import {
  AngleMode,
  evaluateExpression,
  formatResultNumber,
} from './utils/calculatorEngine.ts';
import {
  HistoryItem,
  loadHistory,
  saveHistoryItem,
  deleteHistoryItem,
  clearAllHistory,
  toggleFavoriteHistory,
} from './utils/historyStorage.ts';
import { soundEffects } from './utils/soundEffects.ts';

export default function App() {
  // Calculator state
  const [expression, setExpression] = useState<string>('');
  const [result, setResult] = useState<string>('0');
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [justCalculated, setJustCalculated] = useState<boolean>(false);

  // Mode and toggles
  const [activeTab, setActiveTab] = useState<'basic' | 'scientific' | 'converter'>('scientific');
  const [angleMode, setAngleMode] = useState<AngleMode>(() => {
    return (localStorage.getItem('azure_calc_angle_mode') as AngleMode) || 'DEG';
  });
  const [isSecondActive, setIsSecondActive] = useState<boolean>(false);

  // Memory
  const [memoryValue, setMemoryValue] = useState<number>(0);
  const [hasMemory, setHasMemory] = useState<boolean>(false);

  // History & Overlays
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundEffects.enabled);

  // Initialize history
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Update live preview whenever expression or angle mode changes
  useEffect(() => {
    if (!expression || expression.trim() === '') {
      setLivePreview(null);
      setErrorMessage(null);
      return;
    }

    // Try evaluating live
    const evalRes = evaluateExpression(expression, angleMode);
    if (evalRes.success && evalRes.formatted) {
      setLivePreview(evalRes.formatted);
      setErrorMessage(null);
    } else {
      // Don't show error while user is in the middle of typing
      setLivePreview(null);
    }
  }, [expression, angleMode]);

  // Toggle DEG/RAD
  const handleToggleAngleMode = useCallback(() => {
    soundEffects.playKeyClick('special');
    setAngleMode((prev) => {
      const next = prev === 'DEG' ? 'RAD' : 'DEG';
      localStorage.setItem('azure_calc_angle_mode', next);
      return next;
    });
  }, []);

  // Toggle Sound
  const handleToggleSound = () => {
    const next = !soundEnabled;
    soundEffects.setEnabled(next);
    setSoundEnabled(next);
  };

  // Insert character or operator into expression
  const handleInsert = useCallback(
    (char: string) => {
      setErrorMessage(null);

      // If user just evaluated and clicks an operator (+, -, *, /, ^, %), chain it!
      const isOperator = ['+', '-', '*', '/', '^', '%'].includes(char);

      if (justCalculated) {
        setJustCalculated(false);
        if (isOperator) {
          const baseNum = result === 'Error' || result === 'Infinity' ? '0' : result.replace(/,/g, '');
          setExpression(baseNum + char);
          return;
        } else {
          // If user types a number or constant, start fresh
          setExpression(char);
          setResult('0');
          return;
        }
      }

      setExpression((prev) => {
        // Prevent double decimals in current token
        if (char === '.') {
          const lastToken = prev.split(/[\+\-\*\/\^\(\)]/).pop() || '';
          if (lastToken.includes('.')) return prev;
          if (prev === '' || /[\+\-\*\/\^\(]$/.test(prev)) return prev + '0.';
        }

        // Prevent invalid double operators like ++ or */
        if (isOperator && /[\+\-\*\/]$/.test(prev)) {
          return prev.slice(0, -1) + char;
        }

        return prev + char;
      });
    },
    [justCalculated, result]
  );

  // Insert Function like sin(, sqrt(, etc.
  const handleInsertFunction = useCallback(
    (fnName: string) => {
      setErrorMessage(null);
      if (justCalculated) {
        setJustCalculated(false);
        setExpression(fnName);
        setResult('0');
        return;
      }
      setExpression((prev) => prev + fnName);
    },
    [justCalculated]
  );

  // Backspace last character
  const handleBackspace = useCallback(() => {
    setErrorMessage(null);
    if (justCalculated) {
      setJustCalculated(false);
      return;
    }
    setExpression((prev) => {
      // If ends with a multi-char function e.g. "sin(", delete all of it
      const funcs = ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'log(', 'ln(', 'sqrt(', 'cbrt(', 'abs('];
      for (const fn of funcs) {
        if (prev.endsWith(fn)) {
          return prev.slice(0, -fn.length);
        }
      }
      return prev.slice(0, -1);
    });
  }, [justCalculated]);

  // Clear expression
  const handleClear = useCallback(() => {
    setExpression('');
    setErrorMessage(null);
    setJustCalculated(false);
  }, []);

  // All Clear (Reset everything)
  const handleAllClear = useCallback(() => {
    setExpression('');
    setResult('0');
    setLivePreview(null);
    setErrorMessage(null);
    setJustCalculated(false);
  }, []);

  // Toggle positive/negative sign
  const handleToggleSign = useCallback(() => {
    if (!expression || expression === '0') {
      if (result !== '0') {
        const num = parseFloat(result.replace(/,/g, ''));
        const toggled = -num;
        setResult(formatResultNumber(toggled));
      }
      return;
    }

    setExpression((prev) => {
      // Wrap whole expression or toggle leading sign
      if (prev.startsWith('-(') && prev.endsWith(')')) {
        return prev.slice(2, -1);
      }
      if (prev.startsWith('-')) {
        return prev.slice(1);
      }
      return `-(${prev})`;
    });
  }, [expression, result]);

  // Main Calculate (=) Handler
  const handleCalculate = useCallback(() => {
    if (!expression || expression.trim() === '') return;

    const res = evaluateExpression(expression, angleMode);
    if (res.success && res.value !== undefined && res.formatted) {
      setResult(res.formatted);
      setErrorMessage(null);
      setJustCalculated(true);

      // Save to history
      const updated = saveHistoryItem({
        expression,
        result: res.formatted,
        rawResult: res.value,
        angleMode,
      });
      setHistory(updated);
    } else {
      setErrorMessage(res.error || 'Syntax Error');
      setResult('Error');
    }
  }, [expression, angleMode]);

  // Memory Actions
  const handleMemoryAction = useCallback(
    (action: 'MC' | 'MR' | 'M+' | 'M-' | 'MS') => {
      const currentVal = parseFloat(result.replace(/,/g, '')) || 0;

      switch (action) {
        case 'MC':
          setMemoryValue(0);
          setHasMemory(false);
          break;
        case 'MR':
          if (hasMemory) {
            handleInsert(memoryValue.toString());
          }
          break;
        case 'MS':
          setMemoryValue(currentVal);
          setHasMemory(true);
          break;
        case 'M+':
          setMemoryValue((prev) => prev + currentVal);
          setHasMemory(true);
          break;
        case 'M-':
          setMemoryValue((prev) => prev - currentVal);
          setHasMemory(true);
          break;
      }
    },
    [result, hasMemory, memoryValue, handleInsert]
  );

  // Send converted unit into calculator
  const handleSendToCalculator = (val: string) => {
    const clean = val.replace(/,/g, '');
    setExpression(clean);
    setResult(val);
    setJustCalculated(true);
    setActiveTab('scientific');
  };

  // History Item Select Actions
  const handleSelectExpressionFromHistory = (expr: string) => {
    setExpression(expr);
    setJustCalculated(false);
    setActiveTab('scientific');
  };

  const handleSelectResultFromHistory = (res: string) => {
    handleInsert(res.replace(/,/g, ''));
    setActiveTab('scientific');
  };

  // Global Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently inside an input/textarea/select
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = e.key;

      if (key >= '0' && key <= '9') {
        e.preventDefault();
        soundEffects.playKeyClick('number');
        handleInsert(key);
      } else if (key === '.') {
        e.preventDefault();
        soundEffects.playKeyClick('number');
        handleInsert('.');
      } else if (['+', '-', '*', '/'].includes(key)) {
        e.preventDefault();
        soundEffects.playKeyClick('operator');
        handleInsert(key);
      } else if (key === '^') {
        e.preventDefault();
        soundEffects.playKeyClick('operator');
        handleInsert('^');
      } else if (key === '%') {
        e.preventDefault();
        soundEffects.playKeyClick('operator');
        handleInsert('%');
      } else if (key === '(' || key === ')') {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsert(key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        soundEffects.playKeyClick('equals');
        handleCalculate();
      } else if (key === 'Backspace') {
        e.preventDefault();
        soundEffects.playKeyClick('action');
        handleBackspace();
      } else if (key === 'Escape') {
        e.preventDefault();
        soundEffects.playKeyClick('action');
        handleAllClear();
      } else if (key === 'p' || key === 'P') {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsert('pi');
      } else if (key === 'e' || key === 'E') {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsert('e');
      } else if (key === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsertFunction('sin(');
      } else if (key === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsertFunction('cos(');
      } else if (key === 't' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsertFunction('tan(');
      } else if (key === 'l' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsertFunction('ln(');
      } else if (key === '!') {
        e.preventDefault();
        soundEffects.playKeyClick('special');
        handleInsert('!');
      } else if (key === 'h' || key === 'H') {
        e.preventDefault();
        setIsHistoryOpen((prev) => !prev);
      } else if (key === 'd' || key === 'D') {
        e.preventDefault();
        handleToggleAngleMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleInsert,
    handleInsertFunction,
    handleCalculate,
    handleBackspace,
    handleAllClear,
    handleToggleAngleMode,
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-white">
      {/* Background Decorative Blue Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[750px] h-[450px] bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-900/10 blur-3xl rounded-full" />
      </div>

      {/* Main Top Header */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={history.length}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
      />

      {/* Content Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full">
        {activeTab === 'converter' ? (
          /* Unit Converter Mode */
          <div className="w-full max-w-3xl">
            <UnitConverterView onSendToCalculator={handleSendToCalculator} />
          </div>
        ) : (
          /* Calculator Mode (Scientific or Basic) */
          <div
            className={`w-full ${
              activeTab === 'scientific' ? 'max-w-3xl' : 'max-w-md'
            } flex flex-col gap-4 sm:gap-5 transition-all duration-200`}
          >
            {/* Large Display Screen */}
            <DisplayScreen
              expression={expression}
              result={result}
              livePreview={livePreview}
              angleMode={angleMode}
              onToggleAngleMode={handleToggleAngleMode}
              hasMemory={hasMemory}
              isSecondActive={isSecondActive}
              onBackspace={handleBackspace}
              errorMessage={errorMessage}
            />

            {/* Rounded Tactile Keypad */}
            <Keypad
              onInsert={handleInsert}
              onClear={handleClear}
              onAllClear={handleAllClear}
              onBackspace={handleBackspace}
              onCalculate={handleCalculate}
              onToggleSign={handleToggleSign}
              onInsertFunction={handleInsertFunction}
              onMemoryAction={handleMemoryAction}
              isScientific={activeTab === 'scientific'}
              isSecondActive={isSecondActive}
              onToggleSecond={() => setIsSecondActive((prev) => !prev)}
            />
          </div>
        )}
      </main>

      {/* Calculation History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectExpression={handleSelectExpressionFromHistory}
        onSelectResult={handleSelectResultFromHistory}
        onToggleFavorite={(id) => setHistory(toggleFavoriteHistory(id))}
        onDeleteSingle={(id) => setHistory(deleteHistoryItem(id))}
        onClearAll={() => setHistory(clearAllHistory())}
      />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}
