import { useState } from "react";
import { useStore } from "../store/useStore";
import { Action } from "../types";
import { uid } from "../store/sampleData";
import { ACTION_META } from "../lib/constants";
import { runAction } from "../lib/actions";
import { ActionListEditor } from "../components/ActionEditor";
import { Button, Card, EmptyState, Modal, PageIntro } from "../components/ui";
import { Icon } from "../components/Icon";

export function ActionLibrary() {
  const library = useStore((s) => s.data.library);
  const add = useStore((s) => s.addLibraryAction);
  const remove = useStore((s) => s.removeLibraryAction);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Action[]>([
    { id: uid("act"), type: "openWebsite", payload: { url: "https://" } },
  ]);

  const save = () => {
    if (draft[0]) add(draft[0]);
    setOpen(false);
  };

  return (
    <div className="content">
      <PageIntro
        eyebrow="REUSABLE COMPONENTS"
        title="Action Library"
        description="Saved reusable action templates, URLs, text snippets, and commands ready to attach to shortcuts."
      >
        <Button variant="primary" icon="create" onClick={() => setOpen(true)}>
          New action
        </Button>
      </PageIntro>

      {library.length === 0 ? (
        <EmptyState
          icon="library"
          title="Action library is empty"
          description="Save reusable actions here to quickly attach them to any keyboard gesture."
          action={
            <Button variant="primary" size="sm" icon="create" onClick={() => setOpen(true)}>
              Create template
            </Button>
          }
        />
      ) : (
        <div className="grid cols-3 gap-md">
          {library.map((a) => {
            const meta = ACTION_META[a.type];
            return (
              <Card key={a.id} hover>
                <div className="spread mb-md">
                  <div className="row gap-sm">
                    <div className="stat-icon">
                      <Icon name={meta?.icon ?? "app"} size={16} />
                    </div>
                    <div>
                      <h4 className="bold small no-margin">
                        {a.label ?? meta?.label ?? a.type}
                      </h4>
                      <div className="muted tiny">{meta?.category ?? "General"}</div>
                    </div>
                  </div>

                  <div className="row gap-xs">
                    <Button size="sm" variant="ghost" icon="play" onClick={() => void runAction(a)}>
                      Run
                    </Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(a.id)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <p className="muted tiny no-margin text-ellipsis">
                  {a.payload?.path ||
                    a.payload?.url ||
                    a.payload?.text ||
                    a.payload?.shortcut ||
                    "Configured action template"}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Action Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Action Template"
        width={580}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save to library
            </Button>
          </>
        }
      >
        <ActionListEditor actions={draft} onChange={setDraft} />
      </Modal>
    </div>
  );
}
