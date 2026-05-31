/**
 * Waits for at least one Lavalink node to be in CONNECTED state
 * @param {Object} manager - The Kazagumo manager instance
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default: 5000)
 * @returns {Promise<boolean>} - True if a node is connected, false otherwise
 */
async function waitForNodeConnection(manager, maxWaitTime = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
        const connectedNodes = [...manager.shoukaku.nodes.values()].filter(node => node.state === 2);

        if (connectedNodes.length > 0) {
            return true;
        }

        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
}

/**
 * Checks if any Lavalink nodes are available (connecting or connected)
 * @param {Object} manager - The Kazagumo manager instance
 * @returns {boolean} - True if nodes are available
 */
function hasAvailableNodes(manager) {
    const availableNodes = [...manager.shoukaku.nodes.values()].filter(
        node => node.state === 1 || node.state === 2
    );
    return availableNodes.length > 0;
}

/**
 * Gets the first available Lavalink node
 * @param {Object} manager - The Kazagumo manager instance
 * @returns {Object|null} - The node object or null
 */
function getAvailableNode(manager) {
    const nodes = [...manager.shoukaku.nodes.values()].filter(
        node => node.state === 1 || node.state === 2
    );
    return nodes.length > 0 ? nodes[0] : null;
}

/**
 * Gets the best Lavalink node using Shoukaku's penalty system.
 * Penalty factors in player count, CPU load, and memory pressure.
 * Lower penalty = healthier node. Falls back to first connected node.
 * @param {Object} manager - The Kazagumo manager instance
 * @returns {Object|null} - The least-loaded node or null
 */
function getBestNode(manager) {
    const connectedNodes = [...manager.shoukaku.nodes.values()].filter(
        node => node.state === 2
    );

    if (connectedNodes.length === 0) {
        return getAvailableNode(manager);
    }

    if (connectedNodes.length === 1) {
        return connectedNodes[0];
    }

    let bestNode = null;
    let lowestPenalty = Infinity;

    for (const node of connectedNodes) {
        let penalty = 0;

        const stats = node.stats;
        if (stats) {
            penalty += (stats.playingPlayers || 0) * 2;

            const cpu = stats.cpu;
            if (cpu) {
                const systemLoad = cpu.systemLoad || 0;
                const lavalinkLoad = cpu.lavalinkLoad || 0;
                penalty += Math.round(Math.pow(1.05, 100 * lavalinkLoad) * 10 - 10);
                penalty += Math.round(systemLoad * 100);
            }

            const memory = stats.memory;
            if (memory && memory.reservable > 0) {
                const memUsage = memory.used / memory.reservable;
                if (memUsage > 0.9) penalty += 50;
                else if (memUsage > 0.7) penalty += 20;
            }
        }

        if (node.penalties !== undefined) {
            penalty = node.penalties;
        }

        if (penalty < lowestPenalty) {
            lowestPenalty = penalty;
            bestNode = node;
        }
    }

    return bestNode || connectedNodes[0];
}

module.exports = {
    waitForNodeConnection,
    hasAvailableNodes,
    getAvailableNode,
    getBestNode,
};
