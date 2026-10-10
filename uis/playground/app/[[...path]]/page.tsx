import Workspace from "../../../../packages/shared/frontend/Workspace";
import { legacyDocument } from "../../../../packages/shared/frontend/legacy-document";

export default async function Page() {
  return <Workspace application="Operaciones" document={await legacyDocument()} />;
}