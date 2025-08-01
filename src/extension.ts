import * as vscode from 'vscode';
import { VisualizationPanel } from './visualizationPanel';

let visualizationPanel: VisualizationPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    // Commands
    const toggleCommand = vscode.commands.registerCommand('milkdrop-visualizer.toggle', () => {
        if (visualizationPanel) {
            visualizationPanel.dispose();
            visualizationPanel = undefined;
            vscode.commands.executeCommand('setContext', 'milkdropActive', false);
        } else {
            visualizationPanel = new VisualizationPanel(context.extensionUri);
            vscode.commands.executeCommand('setContext', 'milkdropActive', true);
        }
    });

    const nextPresetCommand = vscode.commands.registerCommand('milkdrop-visualizer.nextPreset', () => {
        visualizationPanel?.nextPreset();
    });

    const prevPresetCommand = vscode.commands.registerCommand('milkdrop-visualizer.prevPreset', () => {
        visualizationPanel?.prevPreset();
    });

    context.subscriptions.push(toggleCommand, nextPresetCommand, prevPresetCommand);
}

export function deactivate() {
    if (visualizationPanel) {
        visualizationPanel.dispose();
    }
}