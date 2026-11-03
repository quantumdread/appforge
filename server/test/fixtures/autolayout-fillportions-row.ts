// Synthetic AutoLayout row: width-filling inputs keep fixed cross-axis heights.
// Byte-exact companion to autolayout-fillportions-row.pa.yaml for the Vitest runtime.
export const AUTOLAYOUT_FILLPORTIONS_ROW = `Screens:
  FormScreen:
    Children:
      - rowName:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            LayoutDirection: =LayoutDirection.Horizontal
          Children:
            - txtFirstName:
                Control: TextInput
                Properties:
                  FillPortions: =1
                  Height: =40
            - txtLastName:
                Control: TextInput
                Properties:
                  FillPortions: =2
                  Height: =40
`;
