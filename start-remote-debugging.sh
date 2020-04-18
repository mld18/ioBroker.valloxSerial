
#!/bin/bash

# Guard (does not run on Mac OS - an maybe also not in other environments)
if [ "$(uname)" == "Darwin" ];
then
  echo "Script does not work on Mac OS. Just try something like the following manually: ";
  echo "node --inspect-brk=<IP_ADDRESS>:<DEBUG_PORT> <PATH_TO_MAIN_JS_RELATIVE_TO_IOBROKER> --force --logs";
  echo "Bye!"
  exit 1;
fi


IP_ADDRESS=$(ip route get 8.8.8.8 | awk '{print $NF;exit}')
DEBUG_PORT=9229

IOBROKER_ROOT=/opt/iobroker
PATH_TO_MAIN_JS=node_modules/iobroker.valloxserial/build/main.js

echo "Outbound IP address is: $IP_ADDRESS";
echo -n "Debugging port set to: $DEBUG_PORT ... ";

# Test if port is in use
PORT_UNUSED=$(nc -z $IP_ADDRESS $DEBUG_PORT; echo $?);

if [ $PORT_UNUSED -ne 0 ]; 
then
  echo "(Port available)";
else
  echo "(Port alread used!)";
  exit 1;
fi

# Save current working directory

# Get module directory
TMP_DIR=$(realpath "$0")
PATH_TO_MODULE=$(dirname "$TMP_DIR")
REL_PATH_TO_MODULE=${PATH_TO_MODULE#$(realpath "$IOBROKER_ROOT")/}
echo -n "ioBroker directory: $IOBROKER_ROOT ";
if [[ -d "$IOBROKER_ROOT" ]]; 
then
  echo "(Directory exists)";
else
  echo "(Directory does not exist!)";
  exit 2;
fi 

echo "Relative path to module: $REL_PATH_TO_MODULE";

cd $PATH_TO_MODULE
REL_PATH_TO_MAIN_JS=$(find . -name 'main.js' -exec echo "{}"  \; | head -n 1 | sed 's#./##')
echo "Relative path to main.js of module: $REL_PATH_TO_MODULE/$REL_PATH_TO_MAIN_JS";

cd $IOBROKER_ROOT
node --inspect-brk=$IP_ADDRESS:$DEBUG_PORT $REL_PATH_TO_MODULE/$REL_PATH_TO_MAIN_JS --debug

# change back to old working directory
cd $PWD
