import {
  campaignNodes,
  equipmentBalanceScenarios,
  levelDefinitions,
  referencePlanningModel,
  referenceStrategies,
  representativeStrategyIdsByLevel,
  runReferenceStrategy,
  runEquipmentBalanceMatrix,
} from "../packages/game-core/dist/index.js";

const reports = [];
for (const levelId of Object.keys(levelDefinitions)) {
  for (const strategyId of representativeStrategyIdsByLevel[levelId]) {
    reports.push(
      runReferenceStrategy(levelId, referenceStrategies[strategyId]),
    );
  }
}

const actByLevelId = Object.fromEntries(
  campaignNodes
    .filter((node) => node.levelId)
    .map((node) => [node.levelId, node.act]),
);

console.log(
  JSON.stringify(
    {
      methodology: {
        active:
          "Exact deterministic simulation ticks at 1x and 20 ticks/second.",
        representative:
          "Active time plus ordinary unpaused first-clear reading and decision time; retries are excluded.",
        planningModel: referencePlanningModel,
        ordinaryPlanningAssumptions:
          "One 33-second briefing, 12 seconds to read each wave preview, and 2.5 seconds per placement, upgrade, sale, or wave-start action. The clock is unpaused; retries and challenge modifiers are excluded.",
        representativeFamilies: {
          "blade-and-magic":
            "Normal mode; alternating Fork Knights and Discount Wizards.",
          "blade-and-song":
            "Normal mode; three Fork Knights per Bardbarian support slot.",
          "five-tower-party":
            "Frozen Assets normal mode; compact Fork Knight, Discount Wizard, and Bardbarian coverage.",
        },
        towerContribution:
          "Attack actions, affected-target hits, damage, and kills observed in deterministic game events.",
        degenerateBuild:
          "Combat-only stress test: two rank-IV Fork Knights begin on the two legal shore pads with no acquisition delay and no other towers.",
      },
      campaign: {
        totalNodes: campaignNodes.length,
        playableMissions: campaignNodes.filter((node) => node.levelId).length,
      },
      masteryEvidence: [
        runReferenceStrategy(
          "siege-and-desist",
          referenceStrategies["claims-control"],
        ),
        runReferenceStrategy(
          "lava-lamp-district",
          referenceStrategies["volcanic-detour"],
        ),
        runReferenceStrategy(
          "necromancers-networking-event",
          referenceStrategies["six-degree-defense"],
        ),
        runReferenceStrategy(
          "quarterly-dragon-review",
          referenceStrategies["executive-budget"],
        ),
      ],
      degenerateBuildEvidence: runReferenceStrategy(
        "frozen-assets",
        referenceStrategies["two-knight-table-service"],
      ),
      equipmentScenarios: Object.keys(equipmentBalanceScenarios),
      equipmentMatrix: runEquipmentBalanceMatrix(),
      reports: reports.map((report) => ({
        act: actByLevelId[report.levelId] ?? null,
        ...report,
      })),
    },
    null,
    2,
  ),
);
