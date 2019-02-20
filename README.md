
# D3DDred.js
This is a WinDbg Javascript extension that makes it much easier to debug D3D12 DRED (Device Removed Extended Data) state after a device removed event.

## Getting Started
### Loading the script
In the WinDbg console, enter:
```
.scriptload <full path to D3DDred.js>
```

### Using D3DDred.js
The D3DDred debugger extension is a visualizer script.  Visualizers provide a custom view of in-application data when using the dx command.

After loading the script, you would typically start by entering:
```
dx d3d12!D3D12DeviceRemovedExtendedData
```

If there is DRED data available you would expect to see something like:
```
(*((d3d12!D3D12_DEVICE_REMOVED_EXTENDED_DATA1 *)0x7ffb0449f008))                 : [object Object] [Type: D3D12_DEVICE_REMOVED_EXTENDED_DATA1]
    [<Raw View>]     [Type: D3D12_VERSIONED_DEVICE_REMOVED_EXTENDED_DATA]
    DREDVersion      : 0x2
    Data             : [object Object] [Type: D3D12_DEVICE_REMOVED_EXTENDED_DATA1]
```
Clicking on Data will further expand a visualized view of the DRED data:

```
(*((d3d12!D3D12_DRED_PAGE_FAULT_OUTPUT *)0x7ffb0449f018))                 : [object Object] [Type: D3D12_DRED_PAGE_FAULT_OUTPUT]
    [<Raw View>]     [Type: D3D12_DRED_PAGE_FAULT_OUTPUT]
    PageFaultVA      : 0x2881e4000
    ExistingAllocations : Count: 2
    RecentFreedAllocations : Count: 1
```

We look forward to your feedback.

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
