Trylo CoWork Runtime 0.5.51 - Windows x64 EXPERIMENTAL dependency

This is the optional background-task daemon, not the ordinary Work feature.
Ordinary Work already uses Trylo CLI and does not need this archive.

The current daemon has NOT passed Control Plane startup readiness.
This archive is kept separately for maintenance and evaluation; it is not a ready-to-use
feature download. Downloading or extracting it does not enable background tasks in Desktop.
The current Desktop edition has no automatic installation or activation UI for it.

Contents: workd/ (compiled daemon and dependencies), work/bin/ (compatibility wrapper),
dependency-manifest.json and the original CoWork MIT license/dependency notices.
Node v24.14.1 for Windows x64 is required and is supplied by the Desktop core package.
Do not replace it with an arbitrary system Node: the native modules depend on its ABI.

Maintenance only: use the wrapper with TRYLO_WORKD_MODE=real and
TRYLO_WORKD_PACKAGED_DIR set to the extracted workd/ directory, under the pinned Node.
Use a separate COWORK_USER_DATA_DIR and your own explicit model configuration.
Repair readiness and validate managed tasks before reintroducing product activation.
