import type { Operator } from "../../types";
import AprsIsFeedPanel from "../aprs/AprsIsFeedPanel";

interface Props {
  operators: Operator[];
  selectedOperatorId: string | null;
}

export default function MapAprsTab({ operators, selectedOperatorId }: Props) {
  const focusedOperator = operators.find((o) => o.id === selectedOperatorId) ?? null;

  return <AprsIsFeedPanel loginCallSign={focusedOperator?.call_sign ?? ""} />;
}
