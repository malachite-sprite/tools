# Tools

## Install
    # Create a symlink for {prefix}/bin/tools
    npm link

### Using npm link
    When you run npm link in a module’s root directory, npm creates a symbolic link from your “global node_modules” directory to the local module’s directory, with two effects:
        - symlinks the global folder {prefix}/lib/node_modules/tools to this package
        - symlinks {prefix}/bin/{name} for all bins from this package
    
    This allows the binaries in this tool to be used from other folders in the terminal.

## Use
    # update a core-client for Rhubarb (in Rhubarb's root directory) as a part of ticket RHUB-000
    mia update core-client RHUB-000

## Uninstall
    # Remove the symlink from {prefix}/bin/tools
    npm unlink
