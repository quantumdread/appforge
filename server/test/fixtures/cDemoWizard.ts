// Synthetic five-step wizard component for analyzer regression coverage.
// Byte-exact companion to cDemoWizard.pa.yaml for the filesystem-free Vitest runtime.
// Block scalars are intentional.
export const C_DEMO_WIZARD = `ComponentDefinitions:
  cDemoWizard:
    DefinitionType: CanvasComponent
    AccessAppScope: true
    CustomProperties:
      ActiveStep:
        PropertyKind: Input
        DisplayName: Active Step
        Description: Current wizard step (1-5)
        DataType: Number
        Default: =1
      SelectedStep:
        PropertyKind: Output
        DisplayName: Selected Step
        Description: Step id the user tapped
        DataType: Number
      OnStepSelect:
        PropertyKind: Event
        DisplayName: On Step Select
        Description: Raised when a step tab is tapped; read SelectedStep in the handler
        ReturnType: None
        Default: =false
    Properties:
      Height: =44
      Width: =640
      Fill: =RGBA(250, 252, 249, 1)
      SelectedStep: =Coalesce(_wizardTapped, 0)
    Children:
      - galSteps:
          Control: Gallery
          Variant: Horizontal
          Properties:
            Items: |-
              =Table({ID: 1, Caption: "Details"}, {ID: 2, Caption: "Product"}, {ID: 3, Caption: "Settings"}, {ID: 4, Caption: "Extras"}, {ID: 5, Caption: "Finish"})
            X: =0
            Y: =0
            Width: =Parent.Width
            Height: =Parent.Height
            TemplateSize: =Self.Width / 5
            TemplatePadding: =0
            ShowScrollbar: =false
          Children:
            - lblStep:
                Control: Label
                Properties:
                  Text: |-
                    =If(ThisItem.ID < cDemoWizard.ActiveStep, "✓ ", "") & ThisItem.Caption
                  X: =0
                  Y: =0
                  Width: =Parent.TemplateWidth
                  Height: =41
                  Size: =11
                  Align: =Align.Center
                  VerticalAlign: =VerticalAlign.Middle
                  Wrap: =false
                  FontWeight: |-
                    =If(ThisItem.ID = cDemoWizard.ActiveStep, FontWeight.Semibold, FontWeight.Normal)
                  Color: |-
                    =If(ThisItem.ID = cDemoWizard.ActiveStep, RGBA(77, 83, 142, 1), If(ThisItem.ID < cDemoWizard.ActiveStep, RGBA(65, 131, 109, 1), RGBA(137, 145, 151, 1)))
            - recActive:
                Control: Rectangle
                Properties:
                  X: =8
                  Y: =41
                  Width: =Parent.TemplateWidth - 16
                  Height: =3
                  Fill: =RGBA(77, 83, 142, 1)
                  Visible: |-
                    =ThisItem.ID = cDemoWizard.ActiveStep
            - btnStepTap:
                Control: Classic/Button
                Properties:
                  Text: =""
                  X: =0
                  Y: =0
                  Width: =Parent.TemplateWidth
                  Height: =44
                  Fill: =RGBA(77, 83, 142, 0)
                  HoverFill: =RGBA(77, 83, 142, 0.05)
                  PressedFill: =RGBA(77, 83, 142, 0.09)
                  BorderStyle: =BorderStyle.None
                  OnSelect: |-
                    =Set(_wizardTapped, ThisItem.ID); cDemoWizard.OnStepSelect()
`;
