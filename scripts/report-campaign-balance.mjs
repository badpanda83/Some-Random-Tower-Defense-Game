import {
  campaignNodes,
  levelDefinitions,
  referencePlanningModel,
  referenceStrategies,
  runReferenceStrategy,
} from "../packages/game-core/dist/index.js";

const reports = [];
for (const levelId of Object.keys(levelDefinitions)) {
  for (const strategy of [
    referenceStrategies["blade-and-magic"],
    referenceStrategies["blade-and-song"],
  ]) {
    reports.push(runReferenceStrategy(levelId, strategy));
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
        towerContribution:
          "Attack actions, affected-target hits, damage, and kills observed in deterministic game events.",
      },
      campaign: {
        totalNodes: campaignNodes.length,
        playableMissions: campaignNodes.filter((node) => node.levelId).length,
      },
      masteryEvidence: runReferenceStrategy(
        "siege-and-desist",
        referenceStrategies["claims-control"],
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
