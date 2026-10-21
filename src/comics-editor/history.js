import { cloneComposition } from './composition.js';

export class HistoryStack {
  constructor(limit = 80) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(composition) {
    this.undoStack.push(cloneComposition(composition));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(current) {
    if (!this.canUndo()) return current;
    this.redoStack.push(cloneComposition(current));
    return this.undoStack.pop();
  }

  redo(current) {
    if (!this.canRedo()) return current;
    this.undoStack.push(cloneComposition(current));
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
