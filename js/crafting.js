import { RECIPES } from './recipes.js';
import { hasItem, removeItem, addItem, getItemCount } from './inventory.js';
import { spendAP, hasAP } from './action-points.js';
import { addMessage, updateHUD } from './ui.js';
import { getIcon } from './icons.js';
import { state } from './state.js';

export function getAvailableRecipes() {
    return RECIPES.map(recipe => ({
        ...recipe,
        canCraft: canCraftRecipe(recipe),
        missingIngredients: getMissingIngredients(recipe),
    }));
}

function _hasToolsForRecipe(recipe) {
    if (!recipe.tools || recipe.tools.length === 0) return true;
    return recipe.tools.every(tool => {
        if (tool.anyOf) return tool.anyOf.some(id => hasItem(id, tool.qty || 1));
        return hasItem(tool.id, tool.qty || 1);
    });
}

export function canCraftRecipe(recipe) {
    return recipe.ingredients.every(ing => hasItem(ing.id, ing.qty)) &&
           _hasToolsForRecipe(recipe) &&
           hasAP(recipe.apCost || 1);
}

/** Returns missing consumed ingredients (tools not included). */
export function getMissingIngredients(recipe) {
    return recipe.ingredients
        .filter(ing => !hasItem(ing.id, ing.qty))
        .map(ing => ({ ...ing, have: getItemCount(ing.id) }));
}

/** Returns missing tool requirements (items that must be present but are not consumed). */
export function getMissingTools(recipe) {
    if (!recipe.tools || recipe.tools.length === 0) return [];
    const missing = [];
    for (const tool of recipe.tools) {
        if (tool.anyOf) {
            const hasSome = tool.anyOf.some(id => hasItem(id, tool.qty || 1));
            if (!hasSome) {
                missing.push({
                    anyOf: tool.anyOf,
                    label: tool.label || tool.anyOf.join(' / '),
                    qty: tool.qty || 1,
                    have: 0,
                    isTool: true,
                });
            }
        } else if (!hasItem(tool.id, tool.qty || 1)) {
            missing.push({ id: tool.id, qty: tool.qty || 1, have: getItemCount(tool.id), isTool: true });
        }
    }
    return missing;
}

export function craft(recipeId) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { success: false, message: 'Unknown recipe.' };

    const apCost = recipe.apCost || 1;
    if (!hasAP(apCost)) return { success: false, message: 'Not enough AP.' };

    const missing = getMissingIngredients(recipe);
    if (missing.length > 0) {
        const names = missing.map(m => `${m.id} (have ${m.have}/${m.qty})`).join(', ');
        return { success: false, message: `Missing: ${names}` };
    }

    if (!_hasToolsForRecipe(recipe)) {
        const missingTools = getMissingTools(recipe);
        const toolNames = missingTools.map(t => t.label || t.id).join(', ');
        return { success: false, message: `Need tool: ${toolNames}` };
    }

    // Consume ONLY ingredients — tools are kept
    for (const ing of recipe.ingredients) removeItem(ing.id, ing.qty);
    spendAP(apCost);

    // Apply effect or add result to inventory
    if (recipe.effect) {
        _applyRecipeEffect(recipe);
    } else {
        addItem(recipe.result.id, recipe.result.qty);
        const info = getIcon(recipe.result.id);
        addMessage(`Crafted: ${recipe.result.qty}× ${info.name}!`, 'success');
    }

    updateHUD();
    return { success: true, message: `Crafted ${recipe.name}.` };
}

function _applyRecipeEffect(recipe) {
    const p = state.player;
    switch (recipe.effect) {
        case 'expand_backpack':
            if (p.maxSlots >= 15) {
                addMessage('Your backpack is already fully upgraded.', 'warning');
            } else {
                p.maxSlots = 15;
                addMessage('🎒 Backpack upgraded! Now 15 slots available.', 'success');
            }
            break;
        default:
            // Fallback: treat as normal item
            addItem(recipe.result.id, recipe.result.qty);
            const info = getIcon(recipe.result.id);
            addMessage(`Crafted: ${recipe.result.qty}× ${info.name}!`, 'success');
    }
}

export function updateCraftingUI() {
    import('./ui.js').then(mod => mod.openCraftingWindow());
}
