import {
  campaignNodes,
  levelDefinitions,
  referencePlanningModel,
  referenceStrategies,
  representativeStrategyIdsByLevel,
  runReferenceStrategy,
  runTwoForkStressReference,
  twoForkStressPadIdsByLevel,
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
          "Economy-authentic no-gear stress matrix: exactly two Fork Knights use the audited seed-123 pads and upgrade normally to rank IV when they survive long enough. No other towers are placed.",
      },
      campaign: {
        totalNodes: campaignNodes.length,
        playableMissions: campaignNodes.filter((node) => node.levelId).length,
      },
      masteryEvidence: [
        runReferenceStrategy(
          "siege-and-desist",
          referenceStrategies["siege-skeleton-crew"],
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
      degenerateBuildEvidence: Object.keys(twoForkStressPadIdsByLevel).map(
        (levelId) => ({
          pads: twoForkStressPadIdsByLevel[levelId],
          ...runTwoForkStressReference(levelId),
        }),
      ),
      prebuiltMaxRankFrozenEvidence: runReferenceStrategy(
        "frozen-assets",
        referenceStrategies["two-knight-table-service"],
      ),
      reports: reports.map((report) => ({
        act: actByLevelId[report.levelId] ?? null,
        ...report,
      })),
    },
    null,
    2,
  ),
);
