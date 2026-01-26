const fs = require('fs');
const path = require('path');

const indexPath = 'index.html';
let content = fs.readFileSync(indexPath, 'utf8');

// Target the specific premature closing div after the floatingActionBtn
const targetText = '<!-- Floating Action Button for Multi-Video Script Generation -->';
const markerIndex = content.indexOf(targetText);

if (markerIndex === -1) {
    console.error('Could not find marker');
    process.exit(1);
}

// Find the first </div> after the marker that is at the root level of the container (line 1749)
// It's usually after </div></div> (for floatingActionBtn)
const part = content.substring(markerIndex);
const searchPattern = '        </div>\n    </div>\n\n    </div>';
// Wait, let's be even more specific based on the view_file output:
/*
1745:                 </button>
1746:             </div>
1747:         </div>
1748: 
1749:     </div>
*/

const exactPattern = '                </button>\n            </div>\n        </div>\n\n    </div>';

const replaceWith = '                </button>\n            </div>\n        </div>';

if (content.indexOf(exactPattern) === -1) {
    console.error('Could not find exact pattern');
    // Try with different spacing
    const fallbackPattern = '                </button>\r\n            </div>\r\n        </div>\r\n\r\n    </div>';
    if (content.indexOf(fallbackPattern) !== -1) {
        content = content.replace(fallbackPattern, '                </button>\r\n            </div>\r\n        </div>');
    } else {
        // More robust search: look for the </div> after the floating button block
        const blockEnd = '                </button>\n            </div>\n        </div>';
        const blockIndex = content.indexOf(blockEnd, markerIndex);
        if (blockIndex !== -1) {
            const afterBlock = content.substring(blockIndex + blockEnd.length);
            const extraDiv = '\n\n    </div>';
            if (afterBlock.startsWith(extraDiv)) {
                content = content.substring(0, blockIndex + blockEnd.length) + afterBlock.substring(extraDiv.length);
            } else {
                console.error('Could not find extra div after block');
                process.exit(1);
            }
        } else {
            process.exit(1);
        }
    }
} else {
    content = content.replace(exactPattern, replaceWith);
}

fs.writeFileSync(indexPath, content, 'utf8');
console.log('Successfully removed premature closing div');
