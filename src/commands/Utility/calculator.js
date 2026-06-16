const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags
} = require('discord.js');
const emoji = require('../../emojis');

// Per-message calculator state
const calcState = new Map();

const defaultState = () => ({
    display: '0',
    input: '',
    prevValue: null,
    operator: null,
    justEvaluated: false
});

const safeEval = (a, op, b) => {
    a = parseFloat(a);
    b = parseFloat(b);
    if (isNaN(a) || isNaN(b)) return NaN;
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 'Error' : a / b;
    }
};

const formatResult = (val) => {
    if (val === 'Error') return 'Error';
    const num = parseFloat(val);
    if (isNaN(num)) return 'Error';
    const str = num.toPrecision(12);
    return parseFloat(str).toString();
};

const buildDisplay = (state) => {
    const expr = state.operator && state.prevValue !== null
        ? `${state.prevValue} ${state.operator}`
        : '';
    const disp = state.display || '0';
    return `\`\`\`\n${expr ? expr + '\n' : ''}  ${disp}\n\`\`\``;
};

const buildButtons = (msgId, userId) => {
    const id = (action) => `calculator_${action}_${msgId}_${userId}`;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id('clear')).setLabel('C').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(id('sign')).setLabel('±').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('pct')).setLabel('%').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('op_/')).setLabel('÷').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id('num_7')).setLabel('7').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_8')).setLabel('8').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_9')).setLabel('9').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('op_*')).setLabel('×').setStyle(ButtonStyle.Primary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id('num_4')).setLabel('4').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_5')).setLabel('5').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_6')).setLabel('6').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('op_-')).setLabel('−').setStyle(ButtonStyle.Primary)
    );
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id('num_1')).setLabel('1').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_2')).setLabel('2').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_3')).setLabel('3').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('op_+')).setLabel('+').setStyle(ButtonStyle.Primary)
    );
    const row5 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id('back')).setLabel('⌫').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('num_0')).setLabel('0').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('dot')).setLabel('.').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('eq')).setLabel('=').setStyle(ButtonStyle.Success)
    );

    return [row1, row2, row3, row4, row5];
};

const buildCalcMessage = (state, msgId, userId) => {
    const displayText = new TextDisplayBuilder()
        .setContent(`### 🧮 Calculator\n${buildDisplay(state)}\n-# Requested by <@${userId}>`);
    const sep = new SeparatorBuilder();
    const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(displayText)
        .addSeparatorComponents(sep);

    const rows = buildButtons(msgId, userId);
    rows.forEach(row => container.addActionRowComponents(row));

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
};

module.exports = {
    name: 'calculator',
    aliases: ['calc'],
    description: 'Interactive button-based calculator',
    category: 'Utility',
    usage: '',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const userId = message.author.id;
        const state = defaultState();

        const placeholder = new TextDisplayBuilder().setContent(`### 🧮 Calculator\n\`\`\`\n  0\n\`\`\``);
        const container = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(placeholder);
        const sent = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        calcState.set(sent.id, state);

        const payload = buildCalcMessage(state, sent.id, userId);
        await sent.edit(payload);

        // Auto-clean state after 10 minutes of inactivity
        const cleanup = setTimeout(() => {
            calcState.delete(sent.id);
        }, 600000);

        // Store cleanup reference on state
        state._cleanup = cleanup;
    },

    // Button handler — routed from interactionCreate via customId prefix "calculator"
    async componentsV2(interaction, client) {
        const parts = interaction.customId.split('_');
        // Format: calculator_<action>_<msgId>_<userId>
        // Note: op actions are: calculator_op_+_<msgId>_<userId> (4 parts for op, 5 for op with special chars)
        // Safer: reconstruct from known positions
        // parts[0] = 'calculator', parts[1] = action type, parts[2] might be op char or start of msgId

        const userId = parts[parts.length - 1];
        const msgId = parts[parts.length - 2];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: `**${emoji.cross} This calculator belongs to <@${userId}>.**`,
                flags: MessageFlags.Ephemeral
            });
        }

        const state = calcState.get(msgId) || defaultState();

        // Determine action
        const actionParts = parts.slice(1, parts.length - 2);
        const actionType = actionParts[0];
        const actionValue = actionParts.slice(1).join('_');

        if (actionType === 'num') {
            const digit = actionValue;
            if (state.justEvaluated) {
                state.input = digit;
                state.justEvaluated = false;
            } else {
                if (state.input.length >= 12) {
                    return interaction.deferUpdate();
                }
                state.input = state.input === '0' ? digit : state.input + digit;
            }
            state.display = state.input || '0';

        } else if (actionType === 'dot') {
            if (state.justEvaluated) {
                state.input = '0.';
                state.justEvaluated = false;
            } else if (!state.input.includes('.')) {
                state.input = (state.input || '0') + '.';
            }
            state.display = state.input;

        } else if (actionType === 'op') {
            const op = actionValue;
            if (state.input !== '' && state.prevValue !== null && state.operator && !state.justEvaluated) {
                const result = safeEval(state.prevValue, state.operator, state.input);
                state.prevValue = formatResult(result);
                state.display = state.prevValue;
            } else if (state.input !== '') {
                state.prevValue = state.input;
            } else if (state.display !== '0' && state.prevValue === null) {
                state.prevValue = state.display;
            }
            state.operator = op;
            state.input = '';
            state.justEvaluated = false;

        } else if (actionType === 'eq') {
            if (state.operator && state.prevValue !== null && state.input !== '') {
                const result = safeEval(state.prevValue, state.operator, state.input);
                const formatted = formatResult(result);
                state.display = formatted;
                state.prevValue = null;
                state.operator = null;
                state.input = formatted === 'Error' ? '' : formatted;
                state.justEvaluated = true;
            }

        } else if (actionType === 'clear') {
            const fresh = defaultState();
            fresh._cleanup = state._cleanup;
            calcState.set(msgId, fresh);
            const payload = buildCalcMessage(fresh, msgId, userId);
            await interaction.message.edit(payload).catch(() => {});
            return interaction.deferUpdate();

        } else if (actionType === 'back') {
            if (state.justEvaluated) {
                state.input = '';
                state.display = '0';
                state.justEvaluated = false;
            } else if (state.input.length > 0) {
                state.input = state.input.slice(0, -1);
                state.display = state.input || '0';
            }

        } else if (actionType === 'sign') {
            if (state.input !== '' && state.input !== '0') {
                state.input = state.input.startsWith('-')
                    ? state.input.slice(1)
                    : '-' + state.input;
                state.display = state.input;
            } else if (state.display !== '0' && state.display !== 'Error') {
                state.display = state.display.startsWith('-')
                    ? state.display.slice(1)
                    : '-' + state.display;
                state.input = state.display;
            }

        } else if (actionType === 'pct') {
            const val = parseFloat(state.input || state.display);
            if (!isNaN(val)) {
                const pct = formatResult(val / 100);
                state.input = pct;
                state.display = pct;
            }
        }

        calcState.set(msgId, state);
        const payload = buildCalcMessage(state, msgId, userId);
        await interaction.message.edit(payload).catch(() => {});
        return interaction.deferUpdate();
    }
};
