#!/bin/bash
set -e

#generate-md --layout thomasf-solarizedcssdark --input ./raw-markdown --output .
generate-md --layout ./layout --input ./raw-markdown --output .
