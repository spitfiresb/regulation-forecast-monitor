import { type CatalogEntry, type Snapshot } from "./model";
import { type Prediction, type Evaluation } from "./prediction/model";
export type RuleDetail = {
  entry: CatalogEntry;
  snapshot: Snapshot | null;
  prediction: Prediction | null;
  evaluation: Evaluation;
  forecast_error?: string;
};
